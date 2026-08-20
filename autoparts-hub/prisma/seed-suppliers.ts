/**
 * Supplier pages, and which supplier each part comes from.
 * --------------------------------------------------------
 * Idempotent: upserts by unique key and only fills a product's supplier when
 * it has none, so re-running never reshuffles sourcing that has been set by
 * hand. Safe on the deployed database.
 *
 *   npm run db:suppliers
 */
import { loadEnv } from './env';
import { sql, one } from '@/lib/sql';
import { newId } from '@/lib/id';

interface SupplierSeed {
  code: string;
  name: string;
  slug: string;
  reliability: string;
  description: string;
  /** Starting performance rating, 1–5. Only applied to unrated suppliers —
   *  see the upsert below, which never overwrites one set in the admin. */
  rating: number;
  /** Whether they take stock back. Applied the same way as `rating`: only
   *  where the terms have not been recorded yet. */
  acceptsReturns: boolean;
  /** Parts brands this supplier stocks. Drives the assignment below. */
  brands: string[];
}

const SUPPLIERS: SupplierSeed[] = [
  {
    code: 'IB16',
    name: 'IB16 Parts',
    slug: 'ib16-parts',
    reliability: 'official',
    description:
      'Official distributor for the German programme — Bosch, Hella, Mahle and Febi. ' +
      'Stock is held locally, so most lines ship the same day.',
    rating: 5,
    acceptsReturns: true,
    brands: ['BOSCH', 'HELLA', 'MAHLE', 'FEBI BILSTEIN', 'MANN-FILTER'],
  },
  {
    code: 'NP20',
    name: 'NP20 Distribution',
    slug: 'np20-distribution',
    reliability: 'reliable',
    description:
      'Braking and chassis specialist carrying Brembo, TRW, ATE and SKF. ' +
      'Deeper range on older platforms than most of the market.',
    rating: 4,
    acceptsReturns: true,
    brands: ['BREMBO', 'TRW', 'ATE', 'SKF', 'LUK', 'SACHS'],
  },
  {
    code: 'BR02',
    name: 'BR02 Supply',
    slug: 'br02-supply',
    reliability: 'standard',
    description:
      'General aftermarket wholesaler — ignition, cooling, lighting and service items ' +
      'from Valeo, Denso, NGK, Gates, Osram and Philips.',
    rating: 3,
    acceptsReturns: false,
    brands: ['VALEO', 'DENSO', 'NGK', 'GATES', 'OSRAM', 'PHILIPS', 'METALCAUCHO'],
  },
];

/** Where a vehicle maker's own-brand parts are sourced. */
const OE_SUPPLIER_CODE = 'IB16';

async function main() {
  for (const s of SUPPLIERS) {
    // `rating` and `acceptsReturns` are set only on insert, and then only
    // where nobody has set them: they are an admin's own judgement and the
    // supplier's own terms, and re-running the seed must not reset either.
    // COALESCE does that in the same statement the ORM needed three for.
    await sql`
      INSERT INTO "Supplier" ("id", "code", "name", "slug", "reliability", "description",
                              "rating", "acceptsReturns")
      VALUES (${newId()}, ${s.code}, ${s.name}, ${s.slug}, ${s.reliability}, ${s.description},
              ${s.rating}, ${s.acceptsReturns})
      ON CONFLICT ("code") DO UPDATE
        SET "name" = EXCLUDED."name",
            "slug" = EXCLUDED."slug",
            "reliability" = EXCLUDED."reliability",
            "description" = EXCLUDED."description",
            "rating" = COALESCE("Supplier"."rating", EXCLUDED."rating"),
            "acceptsReturns" = COALESCE("Supplier"."acceptsReturns", EXCLUDED."acceptsReturns")
    `;
  }

  const suppliers = await sql<{ id: string; code: string }>`
    SELECT "id", "code" FROM "Supplier"
  `;
  const byCode = new Map(suppliers.map((s) => [s.code, s]));

  const brandToSupplier = new Map<string, string>();
  for (const s of SUPPLIERS) {
    const row = byCode.get(s.code);
    if (!row) continue;
    for (const brand of s.brands) brandToSupplier.set(brand, row.id);
  }

  const fallback = byCode.get(OE_SUPPLIER_CODE)?.id ?? suppliers[0]?.id;

  // Only parts with no supplier yet, so a correction made in the admin stands.
  // Assigned in one statement per supplier rather than one per part: the brand
  // map is the only thing that decides, and it groups.
  let assigned = 0;
  if (fallback) {
    const byBrand = new Map<string, string[]>();
    for (const [brand, supplierId] of brandToSupplier) {
      byBrand.set(supplierId, [...(byBrand.get(supplierId) ?? []), brand]);
    }

    for (const [supplierId, brands] of byBrand) {
      // RETURNING because the driver hands back rows, not a count, and the
      // run reports how many parts it sourced.
      const touched = await sql<{ id: string }>`
        UPDATE "Product" p
           SET "supplierId" = ${supplierId}
          FROM "Manufacturer" m
         WHERE m."id" = p."manufacturerId"
           AND p."supplierId" IS NULL
           AND m."name" = ANY(${brands}::text[])
        RETURNING p."id"
      `;
      assigned += touched.length;
    }

    // Whatever is left carries a brand no supplier claims.
    const rest = await sql<{ id: string }>`
      UPDATE "Product" SET "supplierId" = ${fallback}
       WHERE "supplierId" IS NULL
      RETURNING "id"
    `;
    assigned += rest.length;
  }

  const summary = await sql<{
    code: string; slug: string; rating: number | null; acceptsReturns: boolean | null; products: number;
  }>`
    SELECT s."code", s."slug", s."rating", s."acceptsReturns",
           COUNT(p."id")::int AS "products"
    FROM "Supplier" s
    LEFT JOIN "Product" p ON p."supplierId" = s."id"
    GROUP BY s."id"
    ORDER BY s."code" ASC
  `;

  console.log(`suppliers: ${summary.length}`);
  console.log(`products sourced this run: ${assigned}`);
  for (const s of summary) {
    const returns =
      s.acceptsReturns === null ? 'returns?  ' : s.acceptsReturns ? 'returns ok' : 'no returns';
    console.log(
      `  ${s.code.padEnd(6)} ${String(s.products).padStart(3)} parts  ` +
        `${s.rating === null ? 'unrated' : `${s.rating}/5    `}  ${returns}  /${s.slug}`
    );
  }

  const left = await one<{ n: number }>`
    SELECT COUNT(*)::int AS n FROM "Product" WHERE "supplierId" IS NULL
  `;
  console.log(`unsourced remaining: ${left?.n ?? 0}`);
}

loadEnv();
main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  }
);