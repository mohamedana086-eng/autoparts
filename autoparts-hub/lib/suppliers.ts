import 'server-only';
import { sql, one } from '@/lib/sql';
import { newId } from '@/lib/id';

/** Everyone we buy from, for the directory page. */
export interface SupplierRow {
  id: string;
  code: string;
  slug: string;
  name: string;
  description: string | null;
  reliability: string;
  rating: number | null;
  acceptsReturns: boolean | null;
  country: string | null;
  guaranteeMonths: number | null;
  productCount: number;
}

export async function listSuppliers(): Promise<SupplierRow[]> {
  return sql<SupplierRow>`
    SELECT s."id", s."code", s."slug", s."name", s."description", s."reliability",
           s."rating", s."acceptsReturns", s."country", s."guaranteeMonths",
           -- A left join with a count, rather than a subquery per row: one pass
           -- either way at this size, and this one reads as the question asked.
           COUNT(p."id")::int AS "productCount"
    FROM "Supplier" s
    LEFT JOIN "Product" p ON p."supplierId" = s."id"
    GROUP BY s."id"
    ORDER BY s."name" ASC
  `;
}

export interface SupplierBreakdown {
  supplier: SupplierRow & { fastestDelivery: number | null };
  systems: { slug: string; name: string; count: number }[];
  brands: { name: string; count: number }[];
}

/**
 * One supplier's page: who they are, and the shape of their range.
 *
 * The breakdowns are counted in the database rather than by walking their
 * whole product list in memory — the page never wants the parts themselves,
 * only how many fall where. The parts come from
 * /api/catalog/search?supplier=<slug>, which already prices and sorts them.
 */
export async function supplierBySlug(slug: string): Promise<SupplierBreakdown | null> {
  const supplier = await one<SupplierRow & { fastestDelivery: number | null }>`
    SELECT s."id", s."code", s."slug", s."name", s."description", s."reliability",
           s."rating", s."acceptsReturns", s."country", s."guaranteeMonths",
           COUNT(p."id")::int AS "productCount",
           MIN(p."stockDays")::int AS "fastestDelivery"
    FROM "Supplier" s
    LEFT JOIN "Product" p ON p."supplierId" = s."id"
    WHERE s."slug" = ${slug}
    GROUP BY s."id"
  `;

  if (!supplier) return null;

  const [systems, brands] = await Promise.all([
    sql<{ slug: string; name: string; count: number }>`
      SELECT v."slug", v."name", COUNT(*)::int AS count
      FROM "Product" p
      JOIN "VehicleSystem" v ON v."id" = p."vehicleSystemId"
      WHERE p."supplierId" = ${supplier.id}
      GROUP BY v."slug", v."name"
      ORDER BY count DESC, v."name" ASC
    `,
    sql<{ name: string; count: number }>`
      SELECT m."name", COUNT(*)::int AS count
      FROM "Product" p
      JOIN "Manufacturer" m ON m."id" = p."manufacturerId"
      WHERE p."supplierId" = ${supplier.id}
      GROUP BY m."name"
      ORDER BY count DESC, m."name" ASC
    `,
  ]);

  return { supplier, systems, brands };
}

/* ---------------------------------------------------------------- admin --- */

/**
 * A supplier as the admin list shows it.
 *
 * `SupplierRow` above is the public directory's shape; this adds the trading
 * details that only the editor sets, and the currency code the editor's select
 * needs. Separate because the directory has no business carrying a supplier's
 * lead time or what they invoice in.
 */
export interface AdminSupplierRow extends SupplierRow {
  defaultStockDays: number | null;
  purchaseCurrencyId: string | null;
  purchaseCurrencyCode: string | null;
}

export async function adminSuppliers(id?: string): Promise<AdminSupplierRow[]> {
  return sql<AdminSupplierRow>`
    SELECT s."id", s."code", s."slug", s."name", s."description", s."reliability",
           s."rating", s."acceptsReturns", s."country", s."guaranteeMonths",
           s."defaultStockDays", s."purchaseCurrencyId", c."code" AS "purchaseCurrencyCode",
           -- Counted in the lateral rather than by grouping the whole join, so
           -- the currency does not have to be carried through a GROUP BY that
           -- has nothing to do with it.
           p."count"::int AS "productCount"
    FROM "Supplier" s
    LEFT JOIN "Currency" c ON c."id" = s."purchaseCurrencyId"
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS "count" FROM "Product" pr WHERE pr."supplierId" = s."id"
    ) p ON TRUE
    WHERE (${id ?? null}::text IS NULL OR s."id" = ${id ?? null})
    ORDER BY s."name" ASC
  `;
}

export async function adminSupplierById(id: string): Promise<AdminSupplierRow | null> {
  return (await adminSuppliers(id))[0] ?? null;
}

/**
 * Whoever already holds this code or this url, if anyone but `exceptId`.
 *
 * Both columns are unique. Resolved here, with the holder's name and which of
 * the two matched, so the admin is told what clashed rather than shown a
 * constraint violation naming an index.
 */
export async function supplierClash(
  code: string,
  slug: string,
  exceptId?: string
): Promise<{ id: string; name: string; code: string } | null> {
  return one<{ id: string; name: string; code: string }>`
    SELECT "id", "name", "code"
    FROM "Supplier"
    WHERE ("code" = ${code} OR "slug" = ${slug})
      AND (${exceptId ?? null}::text IS NULL OR "id" <> ${exceptId ?? null})
    LIMIT 1
  `;
}

/** What still points at a supplier, and so what stops them being deleted. */
export async function supplierReferences(
  id: string
): Promise<{ products: number; markupRules: number }> {
  const row = await one<{ products: number; markupRules: number }>`
    SELECT (SELECT COUNT(*) FROM "Product" WHERE "supplierId" = ${id})::int AS "products",
           (SELECT COUNT(*) FROM "MarkupRule" WHERE "supplierId" = ${id})::int AS "markupRules"
  `;
  return row ?? { products: 0, markupRules: 0 };
}

export interface SupplierWrite {
  name: string; code: string; slug: string; description: string | null;
  reliability: string; rating: number | null; acceptsReturns: boolean | null;
  country: string | null; guaranteeMonths: number | null; defaultStockDays: number | null;
  purchaseCurrencyId: string | null;
}

export async function createSupplier(input: SupplierWrite): Promise<string> {
  const row = await one<{ id: string }>`
    INSERT INTO "Supplier" ("id", "name", "code", "slug", "description", "reliability",
                           "rating", "acceptsReturns", "country", "guaranteeMonths",
                           "defaultStockDays", "purchaseCurrencyId")
    VALUES (${newId()}, ${input.name}, ${input.code}, ${input.slug}, ${input.description},
            ${input.reliability}, ${input.rating}, ${input.acceptsReturns}, ${input.country},
            ${input.guaranteeMonths}, ${input.defaultStockDays}, ${input.purchaseCurrencyId})
    RETURNING "id"
  `;
  return row!.id;
}

export async function updateSupplier(id: string, input: SupplierWrite): Promise<void> {
  await sql`
    UPDATE "Supplier"
       SET "name" = ${input.name}, "code" = ${input.code}, "slug" = ${input.slug},
           "description" = ${input.description}, "reliability" = ${input.reliability},
           "rating" = ${input.rating}, "acceptsReturns" = ${input.acceptsReturns},
           "country" = ${input.country}, "guaranteeMonths" = ${input.guaranteeMonths},
           "defaultStockDays" = ${input.defaultStockDays},
           "purchaseCurrencyId" = ${input.purchaseCurrencyId}
     WHERE "id" = ${id}
  `;
}

/**
 * The rating and returns fields on their own.
 *
 * The star control and the returns toggle in the list send only these, and
 * this writes only these — so classifying a supplier from the list cannot
 * reach any field the admin did not open the editor to change. Each is null
 * when the caller left it out, which is why the null-cancelling filter cannot
 * be used: null is a value here, not an absence.
 */
export async function updateSupplierQuick(
  id: string,
  fields: { rating?: number | null; acceptsReturns?: boolean | null }
): Promise<void> {
  await sql`
    UPDATE "Supplier"
       SET "rating" = CASE WHEN ${'rating' in fields} THEN ${fields.rating ?? null}::int
                           ELSE "rating" END,
           "acceptsReturns" = CASE WHEN ${'acceptsReturns' in fields}
                                   THEN ${fields.acceptsReturns ?? null}::boolean
                                   ELSE "acceptsReturns" END
     WHERE "id" = ${id}
  `;
}

export async function deleteSupplier(id: string): Promise<void> {
  await sql`DELETE FROM "Supplier" WHERE "id" = ${id}`;
}

/** Active currencies for the editor's select, base first then by code. */
export async function currencyOptions(): Promise<{ id: string; name: string }[]> {
  return sql<{ id: string; name: string }>`
    SELECT "id", "code" || ' — ' || "name" AS "name"
    FROM "Currency"
    WHERE "active" = TRUE
    ORDER BY "isBase" DESC, "code" ASC
  `;
}
