/**
 * How a supplier is classified.
 *
 * Its own module, with no `server-only`, because both the admin routes and
 * the public catalogue search need the vocabulary and each had grown its own
 * copy. A value added to one list and not the other is a filter that silently
 * matches nothing.
 *
 * Ordered strongest relationship first. The order is meaningful — the search
 * facet is presented in it rather than by count, because it is a ranking.
 */
export const RELIABILITIES = ['official', 'dealer', 'reliable', 'standard'] as const;

export type Reliability = (typeof RELIABILITIES)[number];

export function isReliability(value: string): value is Reliability {
  return (RELIABILITIES as readonly string[]).includes(value);
}
