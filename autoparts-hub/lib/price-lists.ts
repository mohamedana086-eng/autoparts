import 'server-only';
import { normalisePartNumber } from '@/lib/part-number';

/**
 * Reading an uploaded purchase-price list.
 *
 * The file is parsed in the browser — the storefront already does that for the
 * bulk lookup — and arrives here as rows. What is left is the part that must
 * not be got wrong: matching each row to a part, and converting what the
 * supplier quoted into the currency the markup engine multiplies up.
 */

/** One row as the uploader sends it, before it is matched to anything. */
export interface RawPriceRow {
  partNumber: string;
  price: number;
  /** ISO code from the file's currency column. Absent means the base. */
  currency?: string | null;
}

export interface PricedRow {
  productId: string;
  partNumber: string;
  /** In the base currency — what gets stored and priced from. */
  price: number;
  /** What the file said, kept only when a conversion actually happened. */
  sourcePrice: number | null;
  sourceCurrency: string | null;
}

export interface RejectedRow {
  partNumber: string;
  reason: string;
}

export interface ReadResult {
  rows: PricedRow[];
  rejected: RejectedRow[];
}

/** Enough of a Currency row to convert with. */
export interface ConversionRate {
  code: string;
  /** Units of this currency per one unit of the base. 1 on the base row. */
  rate: number;
}

const MAX_ROWS = 50_000;

/**
 * Converts a quoted price into the base currency.
 *
 * `rate` is defined as units of that currency per one unit of the base — the
 * definition the Currency model states and the markup engine relies on — so
 * going the other way DIVIDES. The engine multiplies because it converts base
 * into the customer's currency; this converts a supplier's currency into the
 * base, which is the same rate read backwards. Getting it upside down would
 * not throw, it would just quietly misprice a whole catalogue, which is why it
 * is one named function with a test rather than an expression at a call site.
 */
export function toBaseCurrency(price: number, rate: number): number {
  return price / rate;
}

const round = (value: number) => Math.round(value * 100) / 100;

/**
 * Matches rows to parts and converts them.
 *
 * Part numbers are compared on their normalised form, the same way search and
 * the bulk lookup compare them, so a list that writes `0 986 424 815` still
 * lands on the part stored as `0986424815`.
 *
 * Nothing is rejected silently: every row that finds no part, names a currency
 * nobody maintains, or carries a price that is not a number comes back in
 * `rejected` with a reason, so the admin sees what a file failed to cover
 * rather than discovering it as a wrong price later.
 */
export function readPriceRows(
  raw: unknown,
  productIdByNormalisedPartNumber: Map<string, string>,
  ratesByCode: Map<string, ConversionRate>
): { ok: true; value: ReadResult } | { ok: false; error: string } {
  if (!Array.isArray(raw)) return { ok: false, error: 'Expected a list of rows.' };
  if (raw.length === 0) return { ok: false, error: 'That file has no rows in it.' };
  if (raw.length > MAX_ROWS) {
    return { ok: false, error: `A price list can carry at most ${MAX_ROWS.toLocaleString()} rows.` };
  }

  const rows: PricedRow[] = [];
  const rejected: RejectedRow[] = [];
  /** Last row wins on a repeat, but the earlier one is reported, not dropped. */
  const seen = new Map<string, number>();

  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') {
      return { ok: false, error: 'Every row must be an object.' };
    }
    const row = entry as Record<string, unknown>;
    const partNumber = String(row.partNumber ?? '').trim();
    if (!partNumber) continue; // a blank line in a spreadsheet is not an error

    const price = Number(row.price);
    if (!Number.isFinite(price) || price < 0) {
      rejected.push({ partNumber, reason: 'Price is not a number of zero or more.' });
      continue;
    }

    const normalised = normalisePartNumber(partNumber);
    const productId = productIdByNormalisedPartNumber.get(normalised);
    if (!productId) {
      rejected.push({ partNumber, reason: 'No part in the catalogue matches that number.' });
      continue;
    }

    const code = String(row.currency ?? '').trim().toUpperCase();
    let basePrice = price;
    let sourcePrice: number | null = null;
    let sourceCurrency: string | null = null;

    if (code) {
      const currency = ratesByCode.get(code);
      if (!currency) {
        rejected.push({ partNumber, reason: `No currency called ${code} is set up.` });
        continue;
      }
      if (!(currency.rate > 0)) {
        rejected.push({ partNumber, reason: `${code} has no usable rate.` });
        continue;
      }
      // Only recorded as converted when it actually was: a list already in the
      // base currency should not carry a "source" that says the same number.
      if (currency.rate !== 1) {
        basePrice = toBaseCurrency(price, currency.rate);
        sourcePrice = price;
        sourceCurrency = code;
      }
    }

    const previous = seen.get(productId);
    if (previous !== undefined) {
      rejected.push({
        partNumber,
        reason: 'That part appears more than once; the last price in the file was used.',
      });
      rows[previous] = {
        productId,
        partNumber,
        price: round(basePrice),
        sourcePrice,
        sourceCurrency,
      };
      continue;
    }

    seen.set(productId, rows.length);
    rows.push({ productId, partNumber, price: round(basePrice), sourcePrice, sourceCurrency });
  }

  if (rows.length === 0) {
    // Nothing survived. Say which reason accounted for most of it rather than
    // assuming the part numbers were wrong: a file that matched every part and
    // named a currency nobody has set up fails just as completely, and sending
    // the admin to check part numbers would be sending them to the wrong place.
    return { ok: false, error: `Not one row could be used. ${commonestReason(rejected)}` };
  }

  return { ok: true, value: { rows, rejected } };
}

/** The reason that explains most of a wholly-rejected file, for its message. */
function commonestReason(rejected: RejectedRow[]): string {
  if (rejected.length === 0) return 'The file had no usable rows.';

  const counts = new Map<string, number>();
  for (const r of rejected) counts.set(r.reason, (counts.get(r.reason) ?? 0) + 1);

  const [reason, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];

  return count === rejected.length
    ? reason
    : `Most often: ${reason} (${count} of ${rejected.length}).`;
}

export function readListDetails(body: Record<string, unknown>):
  | { ok: true; value: { name: string; description: string | null; sourceName: string | null } }
  | { ok: false; error: string } {
  const name = String(body.name ?? '').trim();
  if (!name) return { ok: false, error: 'Give the list a name.' };
  if (name.length > 120) return { ok: false, error: 'Keep the name under 120 characters.' };

  const description = String(body.description ?? '').trim();
  const sourceName = String(body.sourceName ?? '').trim();

  return {
    ok: true,
    value: {
      name,
      description: description || null,
      sourceName: sourceName || null,
    },
  };
}
