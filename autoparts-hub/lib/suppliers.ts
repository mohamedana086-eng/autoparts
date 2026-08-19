import 'server-only';
import { sql, one } from '@/lib/sql';

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
