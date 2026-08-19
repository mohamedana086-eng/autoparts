import 'server-only';
import { sql, one, tx } from '@/lib/sql';
import { newId } from '@/lib/id';

/**
 * The catalogue as the admin edits it: parts, their pictures and their counts,
 * and the reference lists the editor's selects are built from.
 *
 * Rows come back flat and already aggregated. The list shows one thumbnail and
 * two stock totals per part, and asking for every picture and every shelf to
 * derive them would be three hundred rows fanned out into thousands.
 */

export interface AdminProductRow {
  id: string;
  partNumber: string;
  name: string;
  description: string | null;
  basePrice: number;
  stockDays: number;
  manufacturerId: string;
  manufacturerName: string | null;
  vehicleSystemId: string;
  systemName: string | null;
  supplierId: string | null;
  supplierName: string | null;
  interchangeCount: number;
  imageCount: number;
  primaryImageUrl: string | null;
  /** Null when nobody has counted the part — see serialiseProduct's note. */
  stockOnHand: number | null;
  stockAvailable: number | null;
}

export async function adminProducts(q: string): Promise<AdminProductRow[]> {
  const term = q ? `%${q}%` : null;

  return sql<AdminProductRow>`
    SELECT p."id", p."partNumber", p."name", p."description", p."basePrice", p."stockDays",
           p."manufacturerId", m."name" AS "manufacturerName",
           p."vehicleSystemId", v."name" AS "systemName",
           p."supplierId", s."name" AS "supplierName",
           (SELECT COUNT(*)::int FROM "Interchange" i WHERE i."sourceId" = p."id") AS "interchangeCount",
           (SELECT COUNT(*)::int FROM "ProductImage" pi WHERE pi."productId" = p."id") AS "imageCount",
           img."url" AS "primaryImageUrl",
           st."stockOnHand", st."stockAvailable"
    FROM "Product" p
    JOIN "Manufacturer" m ON m."id" = p."manufacturerId"
    JOIN "VehicleSystem" v ON v."id" = p."vehicleSystemId"
    LEFT JOIN "Supplier" s ON s."id" = p."supplierId"
    LEFT JOIN LATERAL (
      SELECT pi."url" FROM "ProductImage" pi
      WHERE pi."productId" = p."id" ORDER BY pi."sortOrder" ASC LIMIT 1
    ) img ON true
    LEFT JOIN LATERAL (
      SELECT SUM(sl."quantity")::int AS "stockOnHand",
             SUM(sl."quantity" - sl."reserved")::int AS "stockAvailable"
      FROM "StockLevel" sl WHERE sl."productId" = p."id"
    ) st ON true
    -- Brand and system are searched deliberately: an admin typing "brembo"
    -- means the brand, and leaving it out made the filter answer nothing for
    -- it while the storefront found the parts.
    WHERE (${term}::text IS NULL
       OR p."partNumber" ILIKE ${term}
       OR p."name" ILIKE ${term}
       OR m."name" ILIKE ${term}
       OR v."name" ILIKE ${term})
    ORDER BY v."order" ASC, p."partNumber" ASC
    LIMIT 300
  `;
}

export async function adminProductById(id: string): Promise<AdminProductRow | null> {
  const rows = await sql<AdminProductRow>`
    SELECT p."id", p."partNumber", p."name", p."description", p."basePrice", p."stockDays",
           p."manufacturerId", m."name" AS "manufacturerName",
           p."vehicleSystemId", v."name" AS "systemName",
           p."supplierId", s."name" AS "supplierName",
           (SELECT COUNT(*)::int FROM "Interchange" i WHERE i."sourceId" = p."id") AS "interchangeCount",
           (SELECT COUNT(*)::int FROM "ProductImage" pi WHERE pi."productId" = p."id") AS "imageCount",
           img."url" AS "primaryImageUrl",
           st."stockOnHand", st."stockAvailable"
    FROM "Product" p
    JOIN "Manufacturer" m ON m."id" = p."manufacturerId"
    JOIN "VehicleSystem" v ON v."id" = p."vehicleSystemId"
    LEFT JOIN "Supplier" s ON s."id" = p."supplierId"
    LEFT JOIN LATERAL (
      SELECT pi."url" FROM "ProductImage" pi
      WHERE pi."productId" = p."id" ORDER BY pi."sortOrder" ASC LIMIT 1
    ) img ON true
    LEFT JOIN LATERAL (
      SELECT SUM(sl."quantity")::int AS "stockOnHand",
             SUM(sl."quantity" - sl."reserved")::int AS "stockAvailable"
      FROM "StockLevel" sl WHERE sl."productId" = p."id"
    ) st ON true
    WHERE p."id" = ${id}
  `;
  return rows[0] ?? null;
}

export interface NamedRow {
  id: string;
  name: string;
}

/** What the editor's selects are built from. */
export async function catalogueReferences(): Promise<{
  manufacturers: NamedRow[];
  systems: NamedRow[];
  suppliers: NamedRow[];
  warehouses: NamedRow[];
}> {
  const [manufacturers, systems, suppliers, warehouses] = await Promise.all([
    sql<NamedRow>`SELECT "id", "name" FROM "Manufacturer" ORDER BY "name" ASC`,
    sql<NamedRow>`SELECT "id", "name" FROM "VehicleSystem" ORDER BY "order" ASC`,
    sql<NamedRow>`SELECT "id", "name" FROM "Supplier" ORDER BY "name" ASC`,
    // The stock editor needs somewhere to put a count even when no part is
    // held anywhere yet, so the warehouse list travels with the catalogue
    // rather than being fetched again the first time a row is expanded.
    sql<NamedRow>`
      SELECT "id", "code" || ' — ' || "name" AS "name"
      FROM "Warehouse" WHERE "active" = true
      ORDER BY "priority" DESC, "code" ASC
    `,
  ]);

  return { manufacturers, systems, suppliers, warehouses };
}

export interface ProductWrite {
  partNumber: string;
  name: string;
  description: string | null;
  manufacturerId: string;
  vehicleSystemId: string;
  supplierId: string | null;
  basePrice: number;
  stockDays: number;
}

/** Whether the references a write names actually exist. */
export async function checkProductReferences(input: {
  manufacturerId: string;
  vehicleSystemId: string;
  supplierId: string | null;
}): Promise<{ manufacturer: boolean; system: boolean; supplier: boolean; supplierStockDays: number | null }> {
  const [manufacturer, system, supplier] = await Promise.all([
    one`SELECT 1 FROM "Manufacturer" WHERE "id" = ${input.manufacturerId}`,
    one`SELECT 1 FROM "VehicleSystem" WHERE "id" = ${input.vehicleSystemId}`,
    input.supplierId
      ? one<{ defaultStockDays: number | null }>`
          SELECT "defaultStockDays" FROM "Supplier" WHERE "id" = ${input.supplierId}
        `
      : Promise.resolve(null),
  ]);

  return {
    manufacturer: manufacturer !== null,
    system: system !== null,
    supplier: !input.supplierId || supplier !== null,
    supplierStockDays: supplier?.defaultStockDays ?? null,
  };
}

/** The id already carrying this part number, if any. */
export async function productIdByPartNumber(partNumber: string): Promise<string | null> {
  const row = await one<{ id: string }>`
    SELECT "id" FROM "Product" WHERE "partNumber" = ${partNumber}
  `;
  return row?.id ?? null;
}

export async function createProduct(input: ProductWrite): Promise<string> {
  const row = await one<{ id: string }>`
    INSERT INTO "Product" ("id", "partNumber", "name", "description", "manufacturerId",
                           "vehicleSystemId", "supplierId", "basePrice", "stockDays")
    VALUES (${newId()}, ${input.partNumber}, ${input.name}, ${input.description},
            ${input.manufacturerId}, ${input.vehicleSystemId}, ${input.supplierId},
            ${input.basePrice}, ${input.stockDays})
    RETURNING "id"
  `;
  return row!.id;
}

export async function updateProduct(id: string, input: ProductWrite): Promise<void> {
  await sql`
    UPDATE "Product"
    SET "partNumber" = ${input.partNumber}, "name" = ${input.name},
        "description" = ${input.description}, "manufacturerId" = ${input.manufacturerId},
        "vehicleSystemId" = ${input.vehicleSystemId}, "supplierId" = ${input.supplierId},
        "basePrice" = ${input.basePrice}, "stockDays" = ${input.stockDays}
    WHERE "id" = ${id}
  `;
}

/**
 * Deletes a part, unless an order line still points at it.
 *
 * Reported rather than left to the foreign key: an order is a record of what
 * someone bought, and removing the part it names would make that record
 * unreadable. Returns what is in the way so the route can say so.
 */
export async function deleteProduct(id: string): Promise<{ ok: true } | { ok: false; orderCount: number }> {
  const orders = await one<{ count: number }>`
    SELECT COUNT(*)::int AS count FROM "OrderItem" WHERE "productId" = ${id}
  `;
  if ((orders?.count ?? 0) > 0) return { ok: false, orderCount: orders!.count };

  await tx(async (t) => {
    // Interchange and Fitment are ON DELETE RESTRICT, so the part cannot go
    // while they point at it. Both belong to the part rather than record
    // anything independent of it, so they go with it — unlike an order line,
    // which is why that one is refused above instead. Pictures, stock rows and
    // basket lines cascade on their own; see the inventory migration.
    await t.sql`DELETE FROM "Interchange" WHERE "sourceId" = ${id}`;
    await t.sql`DELETE FROM "Fitment" WHERE "productId" = ${id}`;
    await t.sql`DELETE FROM "Product" WHERE "id" = ${id}`;
  });

  return { ok: true };
}

export interface ImageRow {
  id: string;
  url: string;
  alt: string | null;
  sortOrder: number;
}

export async function productImages(productId: string): Promise<ImageRow[]> {
  return sql<ImageRow>`
    SELECT "id", "url", "alt", "sortOrder" FROM "ProductImage"
    WHERE "productId" = ${productId} ORDER BY "sortOrder" ASC
  `;
}

/**
 * Replaces a part's pictures with the list given, in the order given.
 *
 * Order is the only thing that says which picture leads, so the whole list is
 * submitted together and rewritten together — reordering is then the same
 * request as adding, and there is no moment where two images both claim to be
 * first.
 */
export async function replaceProductImages(
  productId: string,
  images: { url: string; alt: string | null }[]
): Promise<ImageRow[]> {
  return tx(async (t) => {
    await t.sql`DELETE FROM "ProductImage" WHERE "productId" = ${productId}`;

    for (const [index, image] of images.entries()) {
      await t.sql`
        INSERT INTO "ProductImage" ("id", "productId", "url", "alt", "sortOrder")
        VALUES (${newId()}, ${productId}, ${image.url}, ${image.alt}, ${index})
      `;
    }

    return t.sql<ImageRow>`
      SELECT "id", "url", "alt", "sortOrder" FROM "ProductImage"
      WHERE "productId" = ${productId} ORDER BY "sortOrder" ASC
    `;
  });
}

export interface StockLevelRow {
  id: string;
  warehouseId: string;
  warehouseName: string;
  warehouseCode: string;
  quantity: number;
  reserved: number;
  binLocation: string | null;
  updatedAt: Date;
}

export async function stockFor(productId: string): Promise<StockLevelRow[]> {
  return sql<StockLevelRow>`
    SELECT sl."id", sl."warehouseId", sl."quantity", sl."reserved", sl."binLocation",
           sl."updatedAt", w."name" AS "warehouseName", w."code" AS "warehouseCode"
    FROM "StockLevel" sl
    JOIN "Warehouse" w ON w."id" = sl."warehouseId"
    WHERE sl."productId" = ${productId}
    ORDER BY w."priority" DESC, w."code" ASC
  `;
}

export interface StockWrite {
  warehouseId: string;
  quantity: number;
  reserved: number;
  binLocation: string | null;
}

/** Which of these warehouse ids exist. */
export async function knownWarehouseIds(ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await sql<{ id: string }>`
    SELECT "id" FROM "Warehouse" WHERE "id" = ANY(${ids}::text[])
  `;
  return rows.map((r) => r.id);
}

/**
 * Replaces this part's counts.
 *
 * A warehouse left out is one that holds none: its row is removed rather than
 * kept at zero, so "not held here" and "counted, none here" do not turn into
 * two rows that read the same. Existing rows are updated rather than recreated
 * so `updatedAt` stays the record of when the shelf was last counted.
 */
export async function replaceStock(productId: string, rows: StockWrite[]): Promise<StockLevelRow[]> {
  return tx(async (t) => {
    const keep = rows.map((r) => r.warehouseId);
    await t.sql`
      DELETE FROM "StockLevel"
      WHERE "productId" = ${productId} AND NOT ("warehouseId" = ANY(${keep}::text[]))
    `;

    for (const row of rows) {
      await t.sql`
        INSERT INTO "StockLevel" ("id", "productId", "warehouseId", "quantity", "reserved", "binLocation", "updatedAt")
        VALUES (${newId()}, ${productId}, ${row.warehouseId}, ${row.quantity},
                ${row.reserved}, ${row.binLocation}, now())
        ON CONFLICT ("productId", "warehouseId") DO UPDATE
        SET "quantity" = ${row.quantity}, "reserved" = ${row.reserved},
            "binLocation" = ${row.binLocation}, "updatedAt" = now()
      `;
    }

    return t.sql<StockLevelRow>`
      SELECT sl."id", sl."warehouseId", sl."quantity", sl."reserved", sl."binLocation",
             sl."updatedAt", w."name" AS "warehouseName", w."code" AS "warehouseCode"
      FROM "StockLevel" sl
      JOIN "Warehouse" w ON w."id" = sl."warehouseId"
      WHERE sl."productId" = ${productId}
      ORDER BY w."priority" DESC, w."code" ASC
    `;
  });
}
