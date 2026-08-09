import 'server-only';

/**
 * Shared shapes and validation for the admin supplier endpoints.
 *
 * Here rather than in the route file for the same reason as
 * `admin-products.ts`: Next only allows a route module to export its handlers
 * and a fixed set of config names, so exporting helpers from one breaks the
 * generated route types.
 */

// The vocabulary lives in lib/supplier-classification.ts so the catalogue
// search shares it rather than keeping a second copy.
export { RELIABILITIES } from '@/lib/supplier-classification';
import { isReliability, RELIABILITIES } from '@/lib/supplier-classification';

export const MIN_RATING = 1;
export const MAX_RATING = 5;

export interface SupplierInput {
  name: string;
  code: string;
  slug: string;
  description: string | null;
  reliability: string;
  /** Null means unrated, which is deliberately different from a low rating. */
  rating: number | null;
  /** Null means the return terms are not established, which is deliberately
   *  different from knowing they refuse. */
  acceptsReturns: boolean | null;
  country: string | null;
  /** Warranty in months. Null means none agreed. */
  guaranteeMonths: number | null;
  /** Lead time for parts that have none of their own. */
  defaultStockDays: number | null;
  /** What they invoice in. Reference only — does not affect pricing. */
  purchaseCurrencyId: string | null;
}

/** A whole number of `unit`, or null. Rejects negatives and fractions. */
function readOptionalCount(
  raw: unknown,
  label: string
): { ok: true; value: number | null } | { ok: false; error: string } {
  if (raw === undefined || raw === null || raw === '') return { ok: true, value: null };

  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    return { ok: false, error: `${label} must be a whole number of zero or more, or left blank.` };
  }
  return { ok: true, value };
}

/**
 * A rating from a request body.
 *
 * An absent, empty or explicitly null rating all mean "unrated" — the admin
 * form sends an empty select value for it, and clearing a rating has to be
 * possible. Anything else has to be a whole number in range; the database
 * carries the same constraint, but failing here gives the admin a sentence
 * instead of a constraint-violation error.
 */
export function readRating(
  raw: unknown
): { ok: true; value: number | null } | { ok: false; error: string } {
  if (raw === undefined || raw === null || raw === '') return { ok: true, value: null };

  const rating = Number(raw);
  if (!Number.isInteger(rating) || rating < MIN_RATING || rating > MAX_RATING) {
    return {
      ok: false,
      error: `Rating must be a whole number from ${MIN_RATING} to ${MAX_RATING}, or left blank.`,
    };
  }

  return { ok: true, value: rating };
}

/**
 * A tri-state flag from a request body.
 *
 * Absent, empty or explicitly null all mean "not established" — the admin
 * form sends an empty select value for that. Everything else has to be an
 * actual boolean or the string form of one, so a typo cannot quietly land as
 * a confident "no".
 */
export function readTriStateFlag(
  raw: unknown,
  label: string
): { ok: true; value: boolean | null } | { ok: false; error: string } {
  if (raw === undefined || raw === null || raw === '') return { ok: true, value: null };
  if (typeof raw === 'boolean') return { ok: true, value: raw };
  if (raw === 'true') return { ok: true, value: true };
  if (raw === 'false') return { ok: true, value: false };

  return { ok: false, error: `${label} must be yes, no, or left blank.` };
}

/** Lowercase, hyphenated, url-safe — a supplier's page is addressed by it. */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Validates a create/update body, returning either the values or a message. */
export function readSupplierInput(
  body: Record<string, unknown>
): { ok: true; value: SupplierInput } | { ok: false; error: string } {
  const name = String(body.name ?? '').trim();
  if (!name) return { ok: false, error: 'Name is required.' };

  const code = String(body.code ?? '').trim().toUpperCase();
  if (!code) return { ok: false, error: 'Code is required.' };

  // Falls back to the name so the admin form does not have to ask for a slug
  // that is almost always just the name in url form.
  const slug = slugify(String(body.slug ?? '').trim() || name);
  if (!slug) {
    return { ok: false, error: 'Could not make a url from that name — give a slug explicitly.' };
  }

  const reliability = String(body.reliability ?? 'standard').trim();
  if (!isReliability(reliability)) {
    return { ok: false, error: `Reliability must be one of ${RELIABILITIES.join(', ')}.` };
  }

  const rating = readRating(body.rating);
  if (!rating.ok) return rating;

  const acceptsReturns = readTriStateFlag(body.acceptsReturns, 'Returns');
  if (!acceptsReturns.ok) return acceptsReturns;

  const guaranteeMonths = readOptionalCount(body.guaranteeMonths, 'Guarantee');
  if (!guaranteeMonths.ok) return guaranteeMonths;

  const defaultStockDays = readOptionalCount(body.defaultStockDays, 'Delivery time');
  if (!defaultStockDays.ok) return defaultStockDays;

  const description = String(body.description ?? '').trim();
  const country = String(body.country ?? '').trim();
  const purchaseCurrencyId = String(body.purchaseCurrencyId ?? '').trim();

  return {
    ok: true,
    value: {
      name,
      code,
      slug,
      description: description || null,
      reliability,
      rating: rating.value,
      acceptsReturns: acceptsReturns.value,
      country: country || null,
      guaranteeMonths: guaranteeMonths.value,
      defaultStockDays: defaultStockDays.value,
      purchaseCurrencyId: purchaseCurrencyId || null,
    },
  };
}

export function serialiseSupplier(s: {
  id: string; code: string; slug: string; name: string; description: string | null;
  reliability: string; rating: number | null; acceptsReturns: boolean | null;
  country?: string | null; guaranteeMonths?: number | null; defaultStockDays?: number | null;
  purchaseCurrencyId?: string | null; purchaseCurrency?: { code: string } | null;
  _count?: { products: number };
}) {
  return {
    id: s.id,
    code: s.code,
    slug: s.slug,
    name: s.name,
    description: s.description,
    reliability: s.reliability,
    rating: s.rating,
    acceptsReturns: s.acceptsReturns,
    country: s.country ?? null,
    guaranteeMonths: s.guaranteeMonths ?? null,
    defaultStockDays: s.defaultStockDays ?? null,
    purchaseCurrencyId: s.purchaseCurrencyId ?? null,
    purchaseCurrencyCode: s.purchaseCurrency?.code ?? null,
    productCount: s._count?.products ?? 0,
  };
}
