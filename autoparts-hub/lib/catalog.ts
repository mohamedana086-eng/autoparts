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

/**
 * What every query that prices a product must load.
 *
 * The active price list's line for the part comes down with the part itself,
 * as a filtered join, rather than the whole list being loaded into memory
 * once per request — a supplier list runs to tens of thousands of rows and a
 * search touches twenty of them.
 *
 * Spread into the `include` of any query whose rows are handed to `priceFor`.
 * Kept here, and only here, because "what does it take to price a product" is
 * one fact, and six routes each answering it separately is six chances for one
 * of them to quietly price from the wrong number.
 */
export const PRICED_PRODUCT_INCLUDE = {
  manufacturer: true,
  vehicleSystem: true,
  // At most one list is active — the database enforces it — so this is at
  // most one row, and `take` says so rather than leaving it implied.
  priceListItems: {
    where: { priceList: { active: true } },
    select: { price: true },
    take: 1,
  },
} as const;

/**
 * The least a row needs for its purchase price to be resolved.
 *
 * Narrower than `PriceableProduct` on purpose: working out what a part cost to
 * buy needs the price and the active list's line, and nothing about the brand
 * or the system it belongs to. Callers that only want the cost — the admin's
 * basket values, for one — should not have to load a manufacturer to get it.
 */
export interface PurchasePriced {
  basePrice: number;
  /** The active list's line, when one covers this part. See the include above. */
  priceListItems?: { price: number }[];
}

interface PriceableProduct extends PurchasePriced {
  partNumber: string;
  supplierId?: string | null;
  manufacturer: { name: string };
  vehicleSystem: { slug: string };
}

/**
 * What the part costs to buy.
 *
 * The active price list wins where it mentions the part; otherwise the part's
 * own `basePrice` stands. A list that covers half the catalogue therefore
 * reprices half of it and leaves the rest exactly as it was, which is what
 * makes uploading one safe — reading a missing line as zero would put every
 * part the supplier did not quote on sale for nothing.
 */
export function purchasePriceOf(product: PurchasePriced): number {
  return product.priceListItems?.[0]?.price ?? product.basePrice;
}

/**
 * What a catalogue query must load to say whether a part is available.
 *
 * Restricted to active warehouses, which is the same restriction
 * `reserveStock` applies when an order actually draws stock down. The two have
 * to agree: a page that says "out of stock" while checkout sells the part, or
 * the reverse, is worse than either page alone.
 */
export const STOCK_INCLUDE = {
  stock: {
    where: { warehouse: { active: true } },
    select: { quantity: true, reserved: true },
  },
} as const;

export interface StockCounted {
  stock?: { quantity: number; reserved: number }[];
}

/**
 * How many can be sold, or null where that is not a question with an answer.
 *
 * Null means nobody has counted this part into a warehouse that can be picked
 * from — untracked, which is not the same as none left. The catalogue sold on
 * `Product.stockDays` alone before warehouses existed and still does for every
 * part nobody has counted, so the honest thing to show is the lead time and no
 * claim about stock at all. Zero means someone did count, and there are none.
 *
 * `quantity - reserved` rather than `quantity`, because what is promised to an
 * order that has not shipped is not available to sell twice.
 */
export function availabilityOf(product: StockCounted): number | null {
  if (!product.stock || product.stock.length === 0) return null;

  return product.stock.reduce((sum, s) => sum + (s.quantity - s.reserved), 0);
}

/**
 * How many may actually be sold.
 *
 * Stock is the authority: a part nobody has counted has none to sell, and
 * `null` and `0` come to the same answer here even though they remain
 * different facts. `availabilityOf` keeps them apart because the two have
 * different causes — one is an unfilled record, the other an empty shelf —
 * and an admin looking at the catalogue needs to tell them apart. Nothing a
 * customer can do depends on which it is.
 *
 * This is the only place that decision is made, so changing the policy back
 * to selling uncounted parts on their lead time is changing this function.
 */
export function sellableQuantity(product: StockCounted): number {
  return availabilityOf(product) ?? 0;
}

export function priceFor(product: PriceableProduct, ctx: PricingContext): PriceResult | null {
  if (!ctx.category) return null;

  return resolvePrice(
    {
      basePrice: purchasePriceOf(product),
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
