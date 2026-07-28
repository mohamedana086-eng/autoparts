import 'server-only';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { resolvePrice, type MarkupRule, type PriceResult } from '@/lib/pricing';

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
  defaultSupplierId: string;
  tierName: string;
  isLoggedIn: boolean;
}

export async function loadPricingContext(): Promise<PricingContext> {
  const session = await getSession();

  const category = session?.categoryId
    ? await prisma.clientCategory.findUnique({ where: { id: session.categoryId } })
    : await prisma.clientCategory.findFirst({ where: { name: 'Retail' } });

  const [rules, supplier] = await Promise.all([
    prisma.markupRule.findMany({ where: { active: true } }),
    prisma.supplier.findFirst(),
  ]);

  return {
    category: category
      ? { id: category.id, name: category.name, markupPercent: category.markupPercent }
      : null,
    rules: rules as unknown as MarkupRule[],
    defaultSupplierId: supplier?.id ?? '',
    tierName: category?.name ?? 'Retail',
    isLoggedIn: !!session,
  };
}

interface PriceableProduct {
  basePrice: number;
  partNumber: string;
  manufacturer: { name: string };
  vehicleSystem: { slug: string };
}

export function priceFor(product: PriceableProduct, ctx: PricingContext): PriceResult | null {
  if (!ctx.category) return null;

  return resolvePrice(
    {
      basePrice: product.basePrice,
      supplierId: ctx.defaultSupplierId,
      manufacturerName: product.manufacturer.name,
      vehicleSystemSlug: product.vehicleSystem.slug,
      partNumber: product.partNumber,
      clientCategoryId: ctx.category.id,
      clientCategoryMarkupPercent: ctx.category.markupPercent,
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
 * Strips everything that is not a letter or digit.
 *
 * Part numbers are printed with whatever separators the brand favours —
 * `0 986 424 815`, `09.9772.11`, `24.5219-0713.3`, `W 712/75` — and nobody
 * types them back the same way. Comparing on this form means the separators
 * stop mattering.
 */
export function normalisePartNumber(value: string): string {
  return value.replace(/[^a-z0-9]/gi, '').toUpperCase();
}

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
