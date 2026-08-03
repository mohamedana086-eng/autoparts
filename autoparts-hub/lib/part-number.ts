/**
 * Comparing part numbers.
 *
 * Kept apart from `lib/catalog.ts` because that module is `server-only` and
 * reaches for the session and the database. This is a pure string function,
 * and the TecDoc importer — a plain Node script, no Next runtime — needs it
 * to match cross-references the same way search does. One definition, so the
 * two can never drift into disagreeing about what counts as the same number.
 */

/**
 * Part numbers are printed with whatever separators the brand favours —
 * `0 986 424 815`, `09.9772.11`, `24.5219-0713.3`, `W 712/75` — and nobody
 * types them back the same way. Comparing on this form means the separators
 * stop mattering.
 */
export function normalisePartNumber(value: string): string {
  return value.replace(/[^a-z0-9]/gi, '').toUpperCase();
}
