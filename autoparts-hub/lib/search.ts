import 'server-only';
import { sql, one } from '@/lib/sql';
import type { PriceableRow } from '@/lib/catalog';

/**
 * The catalogue search, as far as the database is concerned.
 *
 * Ranking, facet counts and every filter that depends on a resolved price stay
 * in the route: they are decided per caller, after the tier has priced each
 * row, and no amount of SQL would move them here honestly. What the database
 * answers is narrower — which parts are reachable at all.
 *
 * The filters that do belong here are written so that a null parameter turns
 * its own clause off:
 *
 *     AND (${supplier}::text IS NULL OR s."slug" = ${supplier})
 *
 * Every combination is therefore the same statement with the same number of
 * parameters, which is what lets a search with six optional filters stay one
 * ordinary tagged template — no query text assembled from strings, and no path
 * where a value could be spliced instead of bound. It costs the planner a
 * little; a catalogue this size does not notice, and a search endpoint is
 * exactly where hand-built SQL text goes wrong.
 */

/** A search hit, flat — the join returns columns, so the row carries columns. */
export interface SearchRow extends PriceableRow {
  id: string;
  name: string;
  description: string | null;
  stockDays: number;
  systemName: string;
  imageUrl: string | null;
  imageAlt: string | null;
  /**
   * Units sellable across active warehouses, or null where nobody has counted
   * the part in. SUM over no rows is null, which is exactly the distinction
   * the catalogue already draws between untracked and empty.
   */
  available: number | null;
  supplierSlug: string | null;
  supplierName: string | null;
  supplierRating: number | null;
  supplierReliability: string | null;
  supplierAcceptsReturns: boolean | null;
}

export interface InterchangeRow {
  sourceId: string;
  targetPartNo: string;
  targetManufacturer: string;
  isOEM: boolean;
}

export interface SearchFilters {
  /** Tokens the query was split into. Empty means no query was typed. */
  tokens: string[];
  /** Ids reached by a separator-insensitive part-number match. */
  normalisedIds: string[];
  /** Restrict to parts that fit this vehicle variant. */
  variant?: string;
  /** Restrict to one supplier, by slug — the value their page URL uses. */
  supplier?: string;
  limit: number;
}

/**
 * A token list that cannot match anything.
 *
 * `NOT EXISTS (SELECT … WHERE NOT …)` over an empty set is vacuously true, so
 * an empty array would quietly return the whole catalogue for a query that
 * found nothing. The query branch is guarded by `hasQuery` anyway; this makes
 * the failure impossible rather than merely unreachable.
 */
const NEVER_MATCHES = ['no-token-can-contain-this-—-sentinel'];

/** Parts matching the query and the filters that narrow the catalogue itself. */
export async function searchProducts(f: SearchFilters): Promise<SearchRow[]> {
  const hasQuery = f.tokens.length > 0 || f.normalisedIds.length > 0;
  const tokens = f.tokens.length > 0 ? f.tokens : NEVER_MATCHES;
  const variant = f.variant ?? null;
  const supplier = f.supplier ?? null;

  return sql<SearchRow>`
    SELECT p."id", p."partNumber", p."name", p."description", p."stockDays",
           p."basePrice", p."supplierId",
           m."name" AS "manufacturerName",
           v."name" AS "systemName", v."slug" AS "systemSlug",
           pli."price" AS "listPrice",
           img."url" AS "imageUrl", img."alt" AS "imageAlt",
           st."available",
           s."slug" AS "supplierSlug", s."name" AS "supplierName", s."rating" AS "supplierRating",
           s."reliability" AS "supplierReliability", s."acceptsReturns" AS "supplierAcceptsReturns"
    FROM "Product" p
    JOIN "Manufacturer" m ON m."id" = p."manufacturerId"
    JOIN "VehicleSystem" v ON v."id" = p."vehicleSystemId"
    LEFT JOIN "Supplier" s ON s."id" = p."supplierId"
    LEFT JOIN "PriceListItem" pli
      ON pli."productId" = p."id"
     AND pli."priceListId" = (SELECT "id" FROM "PriceList" WHERE "active" LIMIT 1)
    -- The leading image and the stock total are one answer per part, so they
    -- come down with the row. Asked afterwards they would be fifty round trips
    -- to render fifty thumbnails.
    LEFT JOIN LATERAL (
      SELECT pi."url", pi."alt"
      FROM "ProductImage" pi
      WHERE pi."productId" = p."id"
      ORDER BY pi."sortOrder" ASC
      LIMIT 1
    ) img ON true
    LEFT JOIN LATERAL (
      SELECT SUM(sl."quantity" - sl."reserved")::int AS "available"
      FROM "StockLevel" sl
      JOIN "Warehouse" w ON w."id" = sl."warehouseId"
      WHERE sl."productId" = p."id" AND w."active" = true
    ) st ON true
    WHERE (
      -- No query: everything is reachable, and the filters below do the work.
      ${hasQuery}::bool IS NOT TRUE
      OR p."id" = ANY(${f.normalisedIds}::text[])
      -- Every token has to land somewhere, but not all in the same column —
      -- which is what lets "bosch brake pad" work, with the brand on one and
      -- the rest on another. Written as "no token fails to match", so the
      -- number of tokens is a value rather than a shape.
      OR NOT EXISTS (
        SELECT 1 FROM unnest(${tokens}::text[]) AS tok
        WHERE NOT (
          p."partNumber" ILIKE '%' || tok || '%'
          OR p."name" ILIKE '%' || tok || '%'
          OR COALESCE(p."description", '') ILIKE '%' || tok || '%'
          OR m."name" ILIKE '%' || tok || '%'
          OR EXISTS (
            SELECT 1 FROM "Interchange" i
            WHERE i."sourceId" = p."id" AND i."targetPartNo" ILIKE '%' || tok || '%'
          )
        )
      )
    )
    AND (${variant}::text IS NULL OR EXISTS (
      SELECT 1 FROM "Fitment" fit
      WHERE fit."productId" = p."id" AND fit."variantId" = ${variant}
    ))
    AND (${supplier}::text IS NULL OR s."slug" = ${supplier})
    LIMIT ${f.limit}
  `;
}

/** The same rows, by id — how the fuzzy fallback re-reads its matches. */
export async function productsByIds(
  ids: string[],
  f: Pick<SearchFilters, 'variant' | 'supplier'>
): Promise<SearchRow[]> {
  if (ids.length === 0) return [];

  const variant = f.variant ?? null;
  const supplier = f.supplier ?? null;

  return sql<SearchRow>`
    SELECT p."id", p."partNumber", p."name", p."description", p."stockDays",
           p."basePrice", p."supplierId",
           m."name" AS "manufacturerName",
           v."name" AS "systemName", v."slug" AS "systemSlug",
           pli."price" AS "listPrice",
           img."url" AS "imageUrl", img."alt" AS "imageAlt",
           st."available",
           s."slug" AS "supplierSlug", s."name" AS "supplierName", s."rating" AS "supplierRating",
           s."reliability" AS "supplierReliability", s."acceptsReturns" AS "supplierAcceptsReturns"
    FROM "Product" p
    JOIN "Manufacturer" m ON m."id" = p."manufacturerId"
    JOIN "VehicleSystem" v ON v."id" = p."vehicleSystemId"
    LEFT JOIN "Supplier" s ON s."id" = p."supplierId"
    LEFT JOIN "PriceListItem" pli
      ON pli."productId" = p."id"
     AND pli."priceListId" = (SELECT "id" FROM "PriceList" WHERE "active" LIMIT 1)
    LEFT JOIN LATERAL (
      SELECT pi."url", pi."alt"
      FROM "ProductImage" pi
      WHERE pi."productId" = p."id"
      ORDER BY pi."sortOrder" ASC
      LIMIT 1
    ) img ON true
    LEFT JOIN LATERAL (
      SELECT SUM(sl."quantity" - sl."reserved")::int AS "available"
      FROM "StockLevel" sl
      JOIN "Warehouse" w ON w."id" = sl."warehouseId"
      WHERE sl."productId" = p."id" AND w."active" = true
    ) st ON true
    WHERE p."id" = ANY(${ids}::text[])
    AND (${variant}::text IS NULL OR EXISTS (
      SELECT 1 FROM "Fitment" fit
      WHERE fit."productId" = p."id" AND fit."variantId" = ${variant}
    ))
    AND (${supplier}::text IS NULL OR s."slug" = ${supplier})
  `;
}

/** Cross-references for a set of parts, grouped by the caller. */
export async function interchangesFor(productIds: string[]): Promise<InterchangeRow[]> {
  if (productIds.length === 0) return [];

  return sql<InterchangeRow>`
    SELECT "sourceId", "targetPartNo", "targetManufacturer", "isOEM"
    FROM "Interchange"
    WHERE "sourceId" = ANY(${productIds}::text[])
  `;
}

export async function systemNameBySlug(slug: string): Promise<string | null> {
  const row = await one<{ name: string }>`
    SELECT "name" FROM "VehicleSystem" WHERE "slug" = ${slug}
  `;
  return row?.name ?? null;
}

export async function supplierNameBySlug(slug: string): Promise<string | null> {
  const row = await one<{ name: string }>`
    SELECT "name" FROM "Supplier" WHERE "slug" = ${slug}
  `;
  return row?.name ?? null;
}

/** "BMW 3 Series (E90) 320d 2.0" — what the vehicle filter shows it is doing. */
export async function variantLabel(variantId: string): Promise<string | null> {
  const row = await one<{ label: string }>`
    SELECT mk."name" || ' ' || mo."name" || ' ' || vv."name" AS "label"
    FROM "VehicleVariant" vv
    JOIN "VehicleModel" mo ON mo."id" = vv."modelId"
    JOIN "VehicleMake" mk ON mk."id" = mo."makeId"
    WHERE vv."id" = ${variantId}
  `;
  return row?.label ?? null;
}
