import 'server-only';

/**
 * Shared shapes and validation for the admin currency endpoints.
 *
 * Here rather than in the route file for the same reason as the other admin
 * helpers: Next only lets a route module export its handlers and a fixed set
 * of config names.
 */

export interface CurrencyInput {
  code: string;
  name: string;
  symbol: string;
  /** Units of this currency per one unit of the base. */
  rate: number;
  active: boolean;
}

/**
 * Validates a create/update body.
 *
 * `isBase` is deliberately not part of this. Which currency the catalogue's
 * purchase prices are kept in is a property of the data, not something to
 * flip on a form — changing it would reinterpret every stored price and every
 * past order at once. The database carries a partial unique index so there
 * can only ever be one, and moving it is a migration.
 */
export function readCurrencyInput(
  body: Record<string, unknown>
): { ok: true; value: CurrencyInput } | { ok: false; error: string } {
  const code = String(body.code ?? '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) {
    return { ok: false, error: 'Code must be a three-letter currency code, like EUR or EGP.' };
  }

  const name = String(body.name ?? '').trim();
  if (!name) return { ok: false, error: 'Name is required.' };

  const symbol = String(body.symbol ?? '').trim();
  if (!symbol) return { ok: false, error: 'Symbol is required.' };

  const rate = Number(body.rate);
  if (!Number.isFinite(rate) || rate <= 0) {
    return { ok: false, error: 'Rate must be a number greater than zero.' };
  }

  return {
    ok: true,
    value: { code, name, symbol, rate, active: body.active !== false },
  };
}

