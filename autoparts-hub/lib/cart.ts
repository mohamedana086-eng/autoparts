import 'server-only';
import { sql, one, tx } from '@/lib/sql';
import { newId } from '@/lib/id';
import type { PriceableRow } from '@/lib/catalog';

/**
 * The basket the API keeps for a signed-in account.
 *
 * No price is stored here — the table holds ids and quantities and nothing
 * else, so there is no second answer to go stale and none to submit in place
 * of the real one. Prices are resolved on every read from the caller's own
 * tier, the same way search resolves them, which is what lets a basket
 * restored on a new device render as a basket rather than a list of numbers.
 */

export interface BasketLineRow extends PriceableRow {
  productId: string;
  name: string;
  stockDays: number;
  quantity: number;
  /** Sellable units, or null where nobody has counted the part in. */
  available: number | null;
}

export interface Basket {
  updatedAt: Date | null;
  items: BasketLineRow[];
}

/**
 * One basket's lines, priced.
 *
 * Written out once and called from both the read and the write, rather than
 * kept as a string spliced into two templates — a query held as text is a
 * query that can have a value pasted into it.
 */
async function linesFor(clientId: string): Promise<BasketLineRow[]> {
  return sql<BasketLineRow>`
    SELECT ci."productId", ci."quantity",
           p."partNumber", p."name", p."basePrice", p."supplierId", p."stockDays",
           m."name" AS "manufacturerName",
           v."slug" AS "systemSlug",
           pli."price" AS "listPrice",
           st."available"
    FROM "CartItem" ci
    JOIN "Cart" c ON c."id" = ci."cartId"
    JOIN "Product" p ON p."id" = ci."productId"
    JOIN "Manufacturer" m ON m."id" = p."manufacturerId"
    JOIN "VehicleSystem" v ON v."id" = p."vehicleSystemId"
    LEFT JOIN "PriceListItem" pli
      ON pli."productId" = p."id"
     AND pli."priceListId" = (SELECT "id" FROM "PriceList" WHERE "active" LIMIT 1)
    LEFT JOIN LATERAL (
      SELECT SUM(sl."quantity" - sl."reserved")::int AS "available"
      FROM "StockLevel" sl
      JOIN "Warehouse" w ON w."id" = sl."warehouseId"
      WHERE sl."productId" = p."id" AND w."active" = true
    ) st ON true
    WHERE c."clientId" = ${clientId}
    ORDER BY ci."addedAt" ASC
  `;
}

export async function basketFor(clientId: string): Promise<Basket> {
  const cart = await one<{ updatedAt: Date }>`
    SELECT "updatedAt" FROM "Cart" WHERE "clientId" = ${clientId}
  `;
  if (!cart) return { updatedAt: null, items: [] };

  return { updatedAt: cart.updatedAt, items: await linesFor(clientId) };
}

/** Which of these product ids the catalogue still carries. */
export async function knownProductIds(ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];

  const rows = await sql<{ id: string }>`
    SELECT "id" FROM "Product" WHERE "id" = ANY(${ids}::text[])
  `;
  return rows.map((r) => r.id);
}

export interface BasketInput {
  productId: string;
  quantity: number;
}

/**
 * Replaces the basket with what was sent.
 *
 * A replace rather than add/remove, because the client already holds the whole
 * basket and is the thing deciding what is in it. Sending the current state
 * avoids the two copies drifting apart, which per-item calls would have to
 * reconcile.
 *
 * `updatedAt` is touched explicitly: the column only moves on a write to Cart
 * itself, and every change here is to its items. The admin's open-baskets list
 * is ordered by it, so a basket edited today must not read as untouched.
 */
export async function replaceBasket(clientId: string, wanted: BasketInput[]): Promise<Basket> {
  const updatedAt = await tx(async (t) => {
    const cart = await t.one<{ id: string }>`
      INSERT INTO "Cart" ("id", "clientId", "updatedAt")
      VALUES (${newId()}, ${clientId}, now())
      ON CONFLICT ("clientId") DO UPDATE SET "updatedAt" = now()
      RETURNING "id"
    `;
    const cartId = cart!.id;

    const ids = wanted.map((w) => w.productId);
    await t.sql`
      DELETE FROM "CartItem"
      WHERE "cartId" = ${cartId} AND NOT ("productId" = ANY(${ids}::text[]))
    `;

    for (const line of wanted) {
      await t.sql`
        INSERT INTO "CartItem" ("id", "cartId", "productId", "quantity")
        VALUES (${newId()}, ${cartId}, ${line.productId}, ${line.quantity})
        ON CONFLICT ("cartId", "productId") DO UPDATE SET "quantity" = ${line.quantity}
      `;
    }

    const row = await t.one<{ updatedAt: Date }>`
      SELECT "updatedAt" FROM "Cart" WHERE "id" = ${cartId}
    `;
    return row!.updatedAt;
  });

  return { updatedAt, items: await linesFor(clientId) };
}

/** Baskets filled and never ordered, for the admin's follow-up list. */
export interface OpenBasketRow {
  id: string;
  clientId: string;
  clientName: string;
  clientEmail: string;
  updatedAt: Date;
  units: number;
  /** Purchase cost of the lines, not what the customer would be quoted. */
  cost: number;
}

export async function openBaskets(
  salesManagerId: string | null,
  limit: number
): Promise<{ baskets: OpenBasketRow[]; items: Map<string, { productId: string; partNumber: string; name: string; quantity: number }[]> }> {
  const baskets = salesManagerId
    ? await sql<OpenBasketRow>`
        SELECT c."id", c."clientId", cl."name" AS "clientName", cl."email" AS "clientEmail",
               c."updatedAt",
               SUM(ci."quantity")::int AS units,
               SUM(ci."quantity" * COALESCE(pli."price", p."basePrice")) AS cost
        FROM "Cart" c
        JOIN "Client" cl ON cl."id" = c."clientId"
        JOIN "CartItem" ci ON ci."cartId" = c."id"
        JOIN "Product" p ON p."id" = ci."productId"
        LEFT JOIN "PriceListItem" pli
          ON pli."productId" = p."id"
         AND pli."priceListId" = (SELECT "id" FROM "PriceList" WHERE "active" LIMIT 1)
        WHERE cl."salesManagerId" = ${salesManagerId}
        GROUP BY c."id", cl."name", cl."email"
        ORDER BY c."updatedAt" ASC
        LIMIT ${limit}
      `
    : await sql<OpenBasketRow>`
        SELECT c."id", c."clientId", cl."name" AS "clientName", cl."email" AS "clientEmail",
               c."updatedAt",
               SUM(ci."quantity")::int AS units,
               SUM(ci."quantity" * COALESCE(pli."price", p."basePrice")) AS cost
        FROM "Cart" c
        JOIN "Client" cl ON cl."id" = c."clientId"
        JOIN "CartItem" ci ON ci."cartId" = c."id"
        JOIN "Product" p ON p."id" = ci."productId"
        LEFT JOIN "PriceListItem" pli
          ON pli."productId" = p."id"
         AND pli."priceListId" = (SELECT "id" FROM "PriceList" WHERE "active" LIMIT 1)
        GROUP BY c."id", cl."name", cl."email"
        ORDER BY c."updatedAt" ASC
        LIMIT ${limit}
      `;

  const lines = await sql<{
    cartId: string; productId: string; partNumber: string; name: string; quantity: number;
  }>`
    SELECT ci."cartId", ci."productId", ci."quantity", p."partNumber", p."name"
    FROM "CartItem" ci
    JOIN "Product" p ON p."id" = ci."productId"
    WHERE ci."cartId" = ANY(${baskets.map((b) => b.id)}::text[])
    ORDER BY ci."addedAt" ASC
  `;

  const items = new Map<string, { productId: string; partNumber: string; name: string; quantity: number }[]>();
  for (const { cartId, ...line } of lines) {
    const list = items.get(cartId);
    if (list) list.push(line);
    else items.set(cartId, [line]);
  }

  return { baskets, items };
}
