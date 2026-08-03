import 'server-only';

/**
 * Shared shapes and validation for the admin supplier endpoints.
 *
 * Here rather than in the route file for the same reason as
 * `admin-products.ts`: Next only allows a route module to export its handlers
 * and a fixed set of config names, so exporting helpers from one breaks the
 * generated route types.
 */

/** What `Supplier.reliability` is allowed to be — the trading relationship. */
export const RELIABILITIES = ['official', 'reliable', 'standard'] as const;

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
  if (!RELIABILITIES.includes(reliability as (typeof RELIABILITIES)[number])) {
    return { ok: false, error: `Reliability must be one of ${RELIABILITIES.join(', ')}.` };
  }

  const rating = readRating(body.rating);
  if (!rating.ok) return rating;

  const description = String(body.description ?? '').trim();

  return {
    ok: true,
    value: { name, code, slug, description: description || null, reliability, rating: rating.value },
  };
}

export function serialiseSupplier(s: {
  id: string; code: string; slug: string; name: string; description: string | null;
  reliability: string; rating: number | null; _count?: { products: number };
}) {
  return {
    id: s.id,
    code: s.code,
    slug: s.slug,
    name: s.name,
    description: s.description,
    reliability: s.reliability,
    rating: s.rating,
    productCount: s._count?.products ?? 0,
  };
}
