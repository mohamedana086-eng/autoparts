import 'server-only';
import { sql, one, tx, isConstraintViolation, UNIQUE_VIOLATION, type Tx } from '@/lib/sql';
import { newId } from '@/lib/id';
import { reserveStock, applyShipmentChange, type Shortfall } from '@/lib/inventory';
import type { PriceableRow } from '@/lib/catalog';

/**
 * Orders, and everything the database is asked about them.
 *
 * The route handlers hold the rules — who may ask, what a valid basket looks
 * like, what a refusal reads like. What is here is the asking.
 */

export interface OrderLineRow {
  orderId: string;
  productId: string;
  partNumber: string;
  name: string;
  manufacturer: string;
  system: string;
  quantity: number;
  unitPrice: number;
}

export interface OrderRow {
  id: string;
  reference: string;
  status: string;
  createdAt: Date;
  currencyCode: string;
  currencyRate: number;
  clientId: string;
  clientName: string;
}

/** An order with its lines attached, which is how every caller wants them. */
export interface OrderWithLines extends OrderRow {
  lines: OrderLineRow[];
}

/**
 * Attaches lines to orders.
 *
 * Two queries and a group rather than one with `json_agg`: the aggregate would
 * save a round trip and cost the row types, and the trip is not the expensive
 * part at these volumes.
 */
async function withLines(orders: OrderRow[]): Promise<OrderWithLines[]> {
  if (orders.length === 0) return [];

  const lines = await sql<OrderLineRow>`
    SELECT i."orderId", i."productId", i."quantity", i."unitPrice",
           p."partNumber", p."name",
           m."name" AS "manufacturer", v."name" AS "system"
    FROM "OrderItem" i
    JOIN "Product" p ON p."id" = i."productId"
    JOIN "Manufacturer" m ON m."id" = p."manufacturerId"
    JOIN "VehicleSystem" v ON v."id" = p."vehicleSystemId"
    WHERE i."orderId" = ANY(${orders.map((o) => o.id)})
    ORDER BY p."partNumber" ASC
  `;

  const byOrder = new Map<string, OrderLineRow[]>();
  for (const line of lines) {
    const list = byOrder.get(line.orderId);
    if (list) list.push(line);
    else byOrder.set(line.orderId, [line]);
  }

  return orders.map((o) => ({ ...o, lines: byOrder.get(o.id) ?? [] }));
}

/** One customer's own orders, newest first. */
export async function ordersForClient(clientId: string): Promise<OrderWithLines[]> {
  const orders = await sql<OrderRow>`
    SELECT o."id", o."reference", o."status", o."createdAt",
           o."currencyCode", o."currencyRate", o."clientId", c."name" AS "clientName"
    FROM "Order" o
    JOIN "Client" c ON c."id" = o."clientId"
    WHERE o."clientId" = ${clientId}
    ORDER BY o."createdAt" DESC
  `;
  return withLines(orders);
}

/**
 * Every order, or only those belonging to one salesperson's customers.
 *
 * Narrowed in the query rather than filtered afterwards, so there is no fuller
 * result to leak.
 */
export async function ordersForStaff(salesManagerId: string | null): Promise<OrderWithLines[]> {
  const orders = salesManagerId
    ? await sql<OrderRow>`
        SELECT o."id", o."reference", o."status", o."createdAt",
               o."currencyCode", o."currencyRate", o."clientId", c."name" AS "clientName"
        FROM "Order" o
        JOIN "Client" c ON c."id" = o."clientId"
        WHERE c."salesManagerId" = ${salesManagerId}
        ORDER BY o."createdAt" DESC
      `
    : await sql<OrderRow>`
        SELECT o."id", o."reference", o."status", o."createdAt",
               o."currencyCode", o."currencyRate", o."clientId", c."name" AS "clientName"
        FROM "Order" o
        JOIN "Client" c ON c."id" = o."clientId"
        ORDER BY o."createdAt" DESC
      `;
  return withLines(orders);
}

/** A part in the flat shape the pricing engine takes, plus what an order needs. */
export type BasketPart = PriceableRow & { id: string; name: string };

export async function priceableProducts(ids: string[]): Promise<BasketPart[]> {
  if (ids.length === 0) return [];

  return sql<BasketPart>`
    SELECT p."id", p."name", p."partNumber", p."basePrice", p."supplierId",
           m."name" AS "manufacturerName",
           v."slug" AS "systemSlug",
           -- At most one list is active, which the database enforces, so this
           -- join can add at most one row per part.
           pli."price" AS "listPrice"
    FROM "Product" p
    JOIN "Manufacturer" m ON m."id" = p."manufacturerId"
    JOIN "VehicleSystem" v ON v."id" = p."vehicleSystemId"
    LEFT JOIN "PriceListItem" pli ON pli."productId" = p."id"
      AND pli."priceListId" = (SELECT "id" FROM "PriceList" WHERE "active" LIMIT 1)
    WHERE p."id" = ANY(${ids})
  `;
}

export interface TierRow {
  id: string;
  name: string;
  minOrderAmount: number;
}

export async function tierById(categoryId: string): Promise<TierRow | null> {
  return one<TierRow>`
    SELECT "id", "name", "minOrderAmount" FROM "ClientCategory" WHERE "id" = ${categoryId}
  `;
}

export interface NewOrderLine {
  productId: string;
  quantity: number;
  unitPrice: number;
}

export interface PlacedOrderRow {
  id: string;
  reference: string;
  status: string;
  createdAt: Date;
}

/** Raised inside the transaction when a part cannot be held, to roll it back. */
export class OutOfStock extends Error {
  constructor(readonly shortfall: Shortfall) {
    super('Not enough stock.');
  }
}

interface PlaceOrderInput {
  clientId: string;
  currencyCode: string;
  currencyRate: number;
  lines: NewOrderLine[];
  /** Called per attempt, so a retry gets a fresh reference. */
  reference: () => string;
}

/**
 * Writes the order and holds the stock behind it, together.
 *
 * Recording an order that failed to hold its stock would promise the same
 * goods twice; holding stock for an order that failed to save would strand it.
 * So both happen in one transaction, and the reservation takes its row locks
 * inside it.
 *
 * The reference is generated and unique, so a collision is possible and cheap
 * to retry — the whole transaction runs again with a new one. A shortfall is
 * not retried: it is an answer, not an accident.
 */
export async function placeOrder(input: PlaceOrderInput): Promise<PlacedOrderRow> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await tx((t) => writeOrder(t, input));
    } catch (e) {
      if (e instanceof OutOfStock) throw e;
      if (!isConstraintViolation(e, UNIQUE_VIOLATION) || attempt === 4) throw e;
    }
  }

  throw new Error('Could not allocate an order reference.');
}

async function writeOrder(t: Tx, input: PlaceOrderInput): Promise<PlacedOrderRow> {
  const orderId = newId();

  const order = await t.one<PlacedOrderRow>`
    INSERT INTO "Order" ("id", "reference", "clientId", "currencyCode", "currencyRate")
    VALUES (${orderId}, ${input.reference()}, ${input.clientId},
            ${input.currencyCode}, ${input.currencyRate})
    RETURNING "id", "reference", "status", "createdAt"
  `;

  // One line per part — the caller deduplicates — so a part maps to one id.
  const lineIdByProduct = new Map<string, string>();
  for (const line of input.lines) {
    const lineId = newId();
    lineIdByProduct.set(line.productId, lineId);
    await t.sql`
      INSERT INTO "OrderItem" ("id", "orderId", "productId", "quantity", "unitPrice")
      VALUES (${lineId}, ${orderId}, ${line.productId}, ${line.quantity}, ${line.unitPrice})
    `;
  }

  const held = await reserveStock(
    t,
    input.lines.map((l) => ({ productId: l.productId, quantity: l.quantity }))
  );
  if (!held.ok) throw new OutOfStock(held.shortfall);

  for (const a of held.allocations) {
    await t.sql`
      INSERT INTO "OrderItemAllocation" ("id", "orderItemId", "warehouseId", "quantity")
      VALUES (${newId()}, ${lineIdByProduct.get(a.productId)!}, ${a.warehouseId}, ${a.quantity})
    `;
  }

  return order!;
}

export async function orderById(orderId: string): Promise<{ id: string; status: string } | null> {
  return one<{ id: string; status: string }>`
    SELECT "id", "status" FROM "Order" WHERE "id" = ${orderId}
  `;
}

/**
 * Moves an order's status, and the shelves with it.
 *
 * The two travel together for the same reason the order and its reservation
 * do: an order shown as shipped whose stock was never drawn down is the
 * discrepancy a warehouse finds at the next count and cannot explain.
 */
export async function setOrderStatus(
  orderId: string,
  from: string,
  to: string,
  hasLeft: (status: string) => boolean
): Promise<{ id: string; status: string }> {
  return tx(async (t) => {
    const updated = await t.one<{ id: string; status: string }>`
      UPDATE "Order" SET "status" = ${to} WHERE "id" = ${orderId}
      RETURNING "id", "status"
    `;

    await applyShipmentChange(t, orderId, hasLeft(from), hasLeft(to));

    return updated!;
  });
}
