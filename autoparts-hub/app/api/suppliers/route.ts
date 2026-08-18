import { NextResponse } from 'next/server';
import { sql } from '@/lib/sql';

interface SupplierRow {
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

// GET /api/suppliers — everyone we buy from, for the directory page.
export async function GET() {
  const suppliers = await sql<SupplierRow>`
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

  return NextResponse.json({ suppliers });
}
