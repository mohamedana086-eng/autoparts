import 'server-only';
import { sql, one } from '@/lib/sql';
import type { PriceableRow } from '@/lib/catalog';

/**
 * Reading one part, and reading a spreadsheet of them.
 *
 * Shares the shape of a search row but not its query: the detail page wants
 * every picture rather than the one that leads, and the bulk check matches on
 * a normalised number rather than on words.
 */

export interface ProductDetailRow extends PriceableRow {
  id: string;
  name: string;
  description: string | null;
  stockDays: number;
  systemName: string;
  available: number | null;
  supplierSlug: string | null;
  supplierName: string | null;
  supplierRating: number | null;
}

export interface ProductImageRow {
  url: string;
  alt: string | null;
}

export interface ProductInterchangeRow {
  id: string;
  targetPartNo: string;
  targetManufacturer: string;
  exactMatch: boolean;
  isOEM: boolean;
}

/** Everything one part page shows, in three queries rather than three joins
 *  that would multiply the part by its images and its cross-references. */
export async function productDetail(id: string): Promise<{
  product: ProductDetailRow;
  images: ProductImageRow[];
  interchanges: ProductInterchangeRow[];
} | null> {
  const product = await one<ProductDetailRow>`
    SELECT p."id", p."partNumber", p."name", p."description", p."stockDays",
           p."basePrice", p."supplierId",
           m."name" AS "manufacturerName",
           v."name" AS "systemName", v."slug" AS "systemSlug",
           pli."price" AS "listPrice",
           st."available",
           s."slug" AS "supplierSlug", s."name" AS "supplierName", s."rating" AS "supplierRating"
    FROM "Product" p
    JOIN "Manufacturer" m ON m."id" = p."manufacturerId"
    JOIN "VehicleSystem" v ON v."id" = p."vehicleSystemId"
    LEFT JOIN "Supplier" s ON s."id" = p."supplierId"
    LEFT JOIN "PriceListItem" pli
      ON pli."productId" = p."id"
     AND pli."priceListId" = (SELECT "id" FROM "PriceList" WHERE "active" LIMIT 1)
    LEFT JOIN LATERAL (
      SELECT SUM(sl."quantity" - sl."reserved")::int AS "available"
      FROM "StockLevel" sl
      JOIN "Warehouse" w ON w."id" = sl."warehouseId"
      WHERE sl."productId" = p."id" AND w."active" = true
    ) st ON true
    WHERE p."id" = ${id}
  `;

  if (!product) return null;

  const [images, interchanges] = await Promise.all([
    sql<ProductImageRow>`
      SELECT "url", "alt" FROM "ProductImage"
      WHERE "productId" = ${id}
      ORDER BY "sortOrder" ASC
    `,
    sql<ProductInterchangeRow>`
      SELECT "id", "targetPartNo", "targetManufacturer", "exactMatch", "isOEM"
      FROM "Interchange"
      WHERE "sourceId" = ${id}
    `,
  ]);

  return { product, images, interchanges };
}

export interface BulkRow extends PriceableRow {
  id: string;
  name: string;
  stockDays: number;
  systemName: string;
  available: number | null;
}

/** The parts a bulk check resolved to, priced the same way search prices. */
export async function productsForBulk(ids: string[]): Promise<BulkRow[]> {
  if (ids.length === 0) return [];

  return sql<BulkRow>`
    SELECT p."id", p."partNumber", p."name", p."basePrice", p."supplierId", p."stockDays",
           m."name" AS "manufacturerName",
           v."name" AS "systemName", v."slug" AS "systemSlug",
           pli."price" AS "listPrice",
           st."available"
    FROM "Product" p
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
    WHERE p."id" = ANY(${ids}::text[])
  `;
}

export interface NormalisedMatch {
  id: string;
  norm: string;
}

export interface InterchangeMatch extends NormalisedMatch {
  target: string;
}

/**
 * Part numbers matching a batch of normalised needles, directly.
 *
 * The normalised form is not stored, so this is a scan — fine for a catalogue
 * this size, and the note in lib/catalog.ts about a normalised column with an
 * index on it applies here too if it ever grows.
 */
export async function matchByNormalisedPartNumber(needles: string[]): Promise<NormalisedMatch[]> {
  if (needles.length === 0) return [];

  return sql<NormalisedMatch>`
    SELECT "id", regexp_replace(upper("partNumber"), '[^A-Z0-9]', '', 'g') AS norm
    FROM "Product"
    WHERE regexp_replace(upper("partNumber"), '[^A-Z0-9]', '', 'g') = ANY(${needles}::text[])
  `;
}

/** The same, reached through a cross-reference rather than the part's own number. */
export async function matchByInterchange(needles: string[]): Promise<InterchangeMatch[]> {
  if (needles.length === 0) return [];

  return sql<InterchangeMatch>`
    SELECT i."sourceId" AS "id",
           regexp_replace(upper(i."targetPartNo"), '[^A-Z0-9]', '', 'g') AS norm,
           i."targetPartNo" AS target
    FROM "Interchange" i
    WHERE regexp_replace(upper(i."targetPartNo"), '[^A-Z0-9]', '', 'g') = ANY(${needles}::text[])
  `;
}
