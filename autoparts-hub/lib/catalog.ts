import 'server-only';
import { sql, one } from '@/lib/sql';
import { getSession } from '@/lib/auth';
import {
  resolvePrice,
  type MarkupRule,
  type PriceResult,
  type PricingCurrency,
} from '@/lib/pricing';
import { normalisePartNumber } from '@/lib/part-number';

/**
 * Pricing context for a catalog request.
 *
 * The tier is taken from the signed-in session, never from a client-supplied
 * id — otherwise anyone could ask for another account's negotiated prices by
 * passing its id.
 */
export interface PricingContext {
  category: { id: string; name: string; markupPercent: number } | null;
  rules: MarkupRule[];
  tierName: string;
  isLoggedIn: boolean;
  /** The signed-in account's negotiated discount. Zero when anonymous. */
  discountPercent: number;
  /** What the account is quoted in. The base currency when anonymous. */
  currency: PricingCurrency | null;
}

export async function loadPricingContext(): Promise<PricingContext> {
  const session = await getSession();

  // Read from the account rather than the cookie. The session is signed, so
  // it could carry these safely, but a discount agreed this morning should
  // apply on the next request rather than whenever the cookie is next
  // reissued.
  //
  // One statement for all four: the tier, the account, the active rules and
  // the currency to quote in. They are read together on every priced request
  // in the application, and four round trips to answer one question is three
  // too many.
  const [account, rules] = await Promise.all([
    one<{
      discountPercent: number | null;
      categoryId: string | null;
      categoryName: string | null;
      categoryMarkupPercent: number | null;
      currencyCode: string | null;
      currencySymbol: string | null;
      currencyRate: number | null;
    }>`
      SELECT c."discountPercent",
             cat."id" AS "categoryId", cat."name" AS "categoryName",
             cat."markupPercent" AS "categoryMarkupPercent",
             -- The account's currency where it has an active one, and the
             -- base row otherwise, so a deactivated currency cannot leave
             -- somebody quoted at a rate nobody is maintaining.
             COALESCE(cur."code", base."code") AS "currencyCode",
             COALESCE(cur."symbol", base."symbol") AS "currencySymbol",
             COALESCE(cur."rate", base."rate") AS "currencyRate"
      FROM (SELECT 1) AS anchor
      -- Left joins throughout, and the anchor row underneath them, so an
      -- anonymous visitor still gets the Retail tier and the base currency
      -- back rather than no row at all.
      LEFT JOIN "Client" c ON c."id" = ${session?.userId ?? null}
      LEFT JOIN "ClientCategory" cat
             ON cat."id" = ${session?.categoryId ?? null}
             OR (${session?.categoryId ?? null}::text IS NULL AND cat."name" = 'Retail')
      LEFT JOIN "Currency" cur ON cur."id" = c."currencyId" AND cur."active"
      LEFT JOIN "Currency" base ON base."isBase"
      LIMIT 1
    `,
    sql<MarkupRule>`
      -- Ordered, because the engine sorts by specificity then priority and
      -- leaves a tie to input order. Heap order settled that before, which is
      -- to say nothing settled it. By id, the rules are ranked the same way
      -- twice running.
      SELECT * FROM "MarkupRule" WHERE "active" ORDER BY "id" ASC
    `,
  ]);

  const currency =
    account?.currencyCode && account.currencySymbol !== null && account.currencyRate !== null
      ? {
          code: account.currencyCode,
          symbol: account.currencySymbol,
          rate: account.currencyRate,
        }
      : null;

  return {
    category:
      account?.categoryId && account.categoryMarkupPercent !== null
        ? {
            id: account.categoryId,
            name: account.categoryName ?? 'Retail',
            markupPercent: account.categoryMarkupPercent,
          }
        : null,
    rules,
    tierName: account?.categoryName ?? 'Retail',
    isLoggedIn: !!session,
    discountPercent: account?.discountPercent ?? 0,
    currency,
  };
}

/**
 * How many of a part may actually be sold.
 *
 * The queries return `null` for a part nobody has counted into a warehouse
 * that can be picked from — untracked, which is not the same as none left,
 * and `SUM` over no rows says so by itself. An admin needs to tell an unfilled
 * record from an empty shelf, so the two stay distinct all the way out of the
 * database and into the catalogue's own responses.
 *
 * Nothing a customer can do turns on which it is, though: stock is the
 * authority, and a part nobody has counted has none to sell. That collapse
 * happens here and nowhere else, so changing the policy back to selling
 * uncounted parts on their lead time is changing this function.
 *
 * It used to sum a list of shelves loaded per part. The shelves are summed in
 * the database now, and what is left is the decision itself.
 */
export function sellableQuantity(available: number | null): number {
  return available ?? 0;
}
/**
 * A part as SQL returns it: flat, because that is what a row is.
 *
 * The Prisma shape nested a manufacturer and a vehicle system inside the
 * product so that a relation could be walked. A join hands back columns, and
 * rebuilding little objects around them only to read one field out again would
 * be dressing the row up as something it is not.
 *
 * `listPrice` is the active price list's figure for this part, null where no
 * list covers it — the same fallback `purchasePriceOf` applies.
 */
export interface PriceableRow {
  basePrice: number;
  partNumber: string;
  supplierId: string | null;
  manufacturerName: string;
  systemSlug: string;
  listPrice: number | null;
}

/** What the part cost to buy, from a flat row. */
export function rowPurchasePrice(row: Pick<PriceableRow, 'basePrice' | 'listPrice'>): number {
  return row.listPrice ?? row.basePrice;
}

/** Prices a flat row. The nested `priceFor` below hands off to this. */
export function priceForRow(row: PriceableRow, ctx: PricingContext): PriceResult | null {
  if (!ctx.category) return null;

  return resolvePrice(
    {
      basePrice: rowPurchasePrice(row),
      // The part's own supplier. This used to be whichever supplier the table
      // happened to return first, which made every supplier markup rule either
      // dead or catalogue-wide depending on row order.
      supplierId: row.supplierId ?? '',
      manufacturerName: row.manufacturerName,
      vehicleSystemSlug: row.systemSlug,
      partNumber: row.partNumber,
      clientCategoryId: ctx.category.id,
      clientCategoryMarkupPercent: ctx.category.markupPercent,
      discountPercent: ctx.discountPercent,
      currency: ctx.currency ?? undefined,
    },
    ctx.rules
  );
}


/** Free-text catalog search. `mode: 'insensitive'` is required on Postgres,
 *  where `contains` is a case-sensitive LIKE. */
export function searchWhere(q: string, system?: string) {
  return {
    AND: [
      q
        ? {
            OR: [
              { partNumber: { contains: q, mode: 'insensitive' as const } },
              { name: { contains: q, mode: 'insensitive' as const } },
            ],
          }
        : {},
      system ? { vehicleSystem: { slug: system } } : {},
    ],
  };
}

/**
 * Rounds to cents.
 *
 * Summing line totals in binary floating point drifts — three parts at 6.85
 * comes to 20.549999999999997. Harmless once a view formats it, but it also
 * feeds the minimum-order comparison, where a total a hair under the
 * threshold would refuse an order that actually meets it.
 */
export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

// Strips everything that is not a letter or digit. Defined in
// lib/part-number.ts so the TecDoc importer — a plain Node script — can
// share it without pulling this server-only module in. Re-exported because
// callers already import it from here.
export { normalisePartNumber };

/**
 * Product ids whose part number, or one of their cross-references, matches
 * the query once separators are ignored.
 *
 * Done in SQL because the normalised form is not stored. That means a scan:
 * fine for a catalogue this size, but if it grows this wants a normalised
 * column with an index on it rather than regexp_replace per row.
 */
export async function idsMatchingNormalisedPartNumber(q: string): Promise<string[]> {
  const needle = normalisePartNumber(q);
  if (needle.length < 3) return [];

  const rows = await sql<{ id: string }>`
    SELECT DISTINCT p."id"
    FROM "Product" p
    LEFT JOIN "Interchange" i ON i."sourceId" = p."id"
    WHERE regexp_replace(upper(p."partNumber"), '[^A-Z0-9]', '', 'g') LIKE ${'%' + needle + '%'}
       OR regexp_replace(upper(i."targetPartNo"), '[^A-Z0-9]', '', 'g') LIKE ${'%' + needle + '%'}
  `;

  return rows.map((r) => r.id);
}

/** Below this a trigram match is more noise than help — tuned against the
 *  catalogue, where a genuine typo scores about 0.6 and up. */
const FUZZY_THRESHOLD = 0.45;

/**
 * Closest products to a query that matched nothing exactly, ordered by how
 * close they are.
 *
 * `word_similarity` compares the query against the best-matching run of
 * words in the target rather than the whole string, so "brak pad" still
 * scores against "Brake pad set, front" without the rest of the name
 * dragging it down. Needs pg_trgm — see the trigram migration.
 */
export async function idsByFuzzyMatch(q: string): Promise<string[]> {
  const needle = q.trim().toLowerCase();
  if (needle.length < 3) return [];

  const rows = await sql<{ id: string }>`
    SELECT p."id",
           GREATEST(
             word_similarity(${needle}, lower(p."name")),
             word_similarity(${needle}, lower(m."name")),
             similarity(lower(p."partNumber"), ${needle})
           ) AS score
    FROM "Product" p
    JOIN "Manufacturer" m ON m."id" = p."manufacturerId"
    WHERE GREATEST(
            word_similarity(${needle}, lower(p."name")),
            word_similarity(${needle}, lower(m."name")),
            similarity(lower(p."partNumber"), ${needle})
          ) >= ${FUZZY_THRESHOLD}
    ORDER BY score DESC, p."name" ASC
    LIMIT 25
  `;

  return rows.map((r) => r.id);
}
