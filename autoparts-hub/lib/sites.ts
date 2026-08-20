import 'server-only';
import { sql, one } from '@/lib/sql';
import { newId } from '@/lib/id';
import type { WarehouseInput, OutletInput } from '@/lib/admin-inventory';

/**
 * The places stock sits and the counters it is sold over.
 *
 * Rows come back in the shape the response uses. The warehouse list carries
 * four aggregates per site — outlets, distinct parts, units and units promised
 * — and each is counted in the database rather than by loading every stock row
 * of every warehouse and reducing them; the numbers are the whole point of the
 * list, and the rows behind them are never shown.
 */

export interface WarehouseRow {
  id: string;
  code: string;
  name: string;
  city: string | null;
  address: string | null;
  active: boolean;
  priority: number;
  outletCount: number;
  /** Distinct parts held here, not units. */
  skuCount: number;
  totalQuantity: number;
  totalReserved: number;
}

/**
 * Warehouses with what each holds.
 *
 * Picking order, then code: the list answers "where would this ship from",
 * and that is the order the answer is decided in.
 */
export async function adminWarehouses(id?: string): Promise<WarehouseRow[]> {
  return sql<WarehouseRow>`
    SELECT w."id", w."code", w."name", w."city", w."address", w."active", w."priority",
           o."count"::int AS "outletCount",
           s."skus"::int AS "skuCount",
           COALESCE(s."quantity", 0)::int AS "totalQuantity",
           COALESCE(s."reserved", 0)::int AS "totalReserved"
    FROM "Warehouse" w
    -- One aggregate row per warehouse rather than one joined row per shelf:
    -- joining both counts at once would multiply them by each other.
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS "count" FROM "RetailOutlet" ro WHERE ro."warehouseId" = w."id"
    ) o ON TRUE
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS "skus", SUM(sl."quantity") AS "quantity", SUM(sl."reserved") AS "reserved"
      FROM "StockLevel" sl WHERE sl."warehouseId" = w."id"
    ) s ON TRUE
    WHERE (${id ?? null}::text IS NULL OR w."id" = ${id ?? null})
    ORDER BY w."priority" DESC, w."code" ASC
  `;
}

export async function warehouseById(id: string): Promise<WarehouseRow | null> {
  return (await adminWarehouses(id))[0] ?? null;
}

/** The id of whoever already holds this code, so a clash can name itself. */
export async function warehouseIdByCode(code: string): Promise<string | null> {
  const row = await one<{ id: string }>`SELECT "id" FROM "Warehouse" WHERE "code" = ${code}`;
  return row?.id ?? null;
}

export async function createWarehouse(input: WarehouseInput): Promise<string> {
  const row = await one<{ id: string }>`
    INSERT INTO "Warehouse" ("id", "code", "name", "city", "address", "active", "priority")
    VALUES (${newId()}, ${input.code}, ${input.name}, ${input.city}, ${input.address},
            ${input.active}, ${input.priority})
    RETURNING "id"
  `;
  return row!.id;
}

export async function updateWarehouse(id: string, input: WarehouseInput): Promise<void> {
  await sql`
    UPDATE "Warehouse"
       SET "code" = ${input.code}, "name" = ${input.name}, "city" = ${input.city},
           "address" = ${input.address}, "active" = ${input.active}, "priority" = ${input.priority}
     WHERE "id" = ${id}
  `;
}

/**
 * Order lines still held at a warehouse.
 *
 * Their foreign key is ON DELETE RESTRICT, so a warehouse carrying any of them
 * cannot go. An allocation outlives the shipment that consumed it, so this can
 * be non-zero while nothing at all is left on the shelves — which is exactly
 * the case a units-only guard walks straight past into a database error.
 */
export async function allocationsAt(warehouseId: string): Promise<number> {
  const row = await one<{ count: number }>`
    SELECT COUNT(*)::int AS count FROM "OrderItemAllocation" WHERE "warehouseId" = ${warehouseId}
  `;
  return row?.count ?? 0;
}

export async function deleteWarehouse(id: string): Promise<void> {
  await sql`DELETE FROM "Warehouse" WHERE "id" = ${id}`;
}

export interface OutletRow {
  id: string;
  code: string;
  name: string;
  city: string | null;
  address: string | null;
  phone: string | null;
  warehouseId: string | null;
  warehouseName: string | null;
  warehouseCode: string | null;
  active: boolean;
}

/** Open counters first, then by code — a closed outlet is reference, not work. */
export async function adminOutlets(id?: string): Promise<OutletRow[]> {
  return sql<OutletRow>`
    SELECT o."id", o."code", o."name", o."city", o."address", o."phone",
           o."warehouseId", w."name" AS "warehouseName", w."code" AS "warehouseCode", o."active"
    FROM "RetailOutlet" o
    LEFT JOIN "Warehouse" w ON w."id" = o."warehouseId"
    WHERE (${id ?? null}::text IS NULL OR o."id" = ${id ?? null})
    ORDER BY o."active" DESC, o."code" ASC
  `;
}

export async function outletById(id: string): Promise<OutletRow | null> {
  return (await adminOutlets(id))[0] ?? null;
}

export async function outletIdByCode(code: string): Promise<string | null> {
  const row = await one<{ id: string }>`SELECT "id" FROM "RetailOutlet" WHERE "code" = ${code}`;
  return row?.id ?? null;
}

export async function warehouseExists(id: string): Promise<boolean> {
  const row = await one<{ id: string }>`SELECT "id" FROM "Warehouse" WHERE "id" = ${id}`;
  return row !== null;
}

export async function createOutlet(input: OutletInput): Promise<string> {
  const row = await one<{ id: string }>`
    INSERT INTO "RetailOutlet" ("id", "code", "name", "city", "address", "phone",
                                "warehouseId", "active")
    VALUES (${newId()}, ${input.code}, ${input.name}, ${input.city}, ${input.address},
            ${input.phone}, ${input.warehouseId}, ${input.active})
    RETURNING "id"
  `;
  return row!.id;
}

export async function updateOutlet(id: string, input: OutletInput): Promise<void> {
  await sql`
    UPDATE "RetailOutlet"
       SET "code" = ${input.code}, "name" = ${input.name}, "city" = ${input.city},
           "address" = ${input.address}, "phone" = ${input.phone},
           "warehouseId" = ${input.warehouseId}, "active" = ${input.active}
     WHERE "id" = ${id}
  `;
}

export async function deleteOutlet(id: string): Promise<void> {
  await sql`DELETE FROM "RetailOutlet" WHERE "id" = ${id}`;
}

/** For the outlet editor's warehouse select, in the same order as the list. */
export async function warehouseOptions(): Promise<{ id: string; name: string }[]> {
  return sql<{ id: string; name: string }>`
    SELECT "id", "code" || ' — ' || "name" AS "name"
    FROM "Warehouse"
    ORDER BY "priority" DESC, "code" ASC
  `;
}

