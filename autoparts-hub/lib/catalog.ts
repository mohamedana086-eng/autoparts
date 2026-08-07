import 'server-only';
import { prisma } from '@/lib/db';
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
  const client = session
    ? await prisma.client.findUnique({
        where: { id: session.userId },
        select: { discountPercent: true, currency: true },
      })
    : null;

  const category = session?.categoryId
    ? await prisma.clientCategory.findUnique({ where: { id: session.categoryId } })
    : await prisma.clientCategory.findFirst({ where: { name: 'Retail' } });

  const rules = await prisma.markupRule.findMany({ where: { active: true } });

  // Falls back to the base row so a deactivated currency cannot leave an
  // account quoted at a rate nobody is maintaining.
  const currency =
    client?.currency && client.currency.active
      ? {
          code: client.currency.code,
          symbol: client.currency.symbol,
          rate: client.currency.rate,
        }
      : await loadBaseCurrency();

  return {
    category: category
      ? { id: category.id, name: category.name, markupPercent: category.markupPercent }
      : null,
    rules: rules as unknown as MarkupRule[],
    tierName: category?.name ?? 'Retail',
    isLoggedIn: !!session,
    discountPercent: client?.discountPercent ?? 0,
    currency,
  };
}

async function loadBaseCurrency(): Promise<PricingCurrency | null> {
  const base = await prisma.currency.findFirst({ where: { isBase: true } });
  return base ? { code: base.code, symbol: base.symbol, rate: base.rate } : null;
}

interface PriceableProduct {
  basePrice: number;
  partNumber: string;
  supplierId?: string | null;
  manufacturer: { name: string };
  vehicleSystem: { slug: string };
}

export function priceFor(product: PriceableProduct, ctx: PricingContext): PriceResult | null {
  if (!ctx.category) return null;

  return resolvePrice(
    {
      basePrice: product.basePrice,
      // The part's own supplier. This used to be whichever supplier the table
      // happened to return first, which made every supplier markup rule either
      // dead or catalogue-wide depending on row order.
      supplierId: product.supplierId ?? '',
      manufacturerName: product.manufacturer.name,
      vehicleSystemSlug: product.vehicleSystem.slug,
      partNumber: product.partNumber,
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

  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
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

  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
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
