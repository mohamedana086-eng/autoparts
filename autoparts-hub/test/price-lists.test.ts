import { describe, expect, it } from 'vitest';
import { readPriceRows, toBaseCurrency, type ConversionRate } from '@/lib/price-lists';

/**
 * Reading a supplier's price list.
 *
 * The conversion is the part worth pinning down. `rate` means units of that
 * currency per one unit of the base, so turning a quoted price into the base
 * divides where the markup engine multiplies. Upside down it throws nothing —
 * it just misprices the catalogue by the square of the rate.
 */

const products = new Map<string, string>([
  ['0986424815', 'p-bosch'],
  ['W71275', 'p-mann'],
  ['17138616418', 'p-bmw'],
]);

const rates = new Map<string, ConversionRate>([
  ['EUR', { code: 'EUR', rate: 1 }],
  // 1 EUR buys 1.1 USD, and 50 EGP.
  ['USD', { code: 'USD', rate: 1.1 }],
  ['EGP', { code: 'EGP', rate: 50 }],
]);

const read = (rows: unknown) => readPriceRows(rows, products, rates);

const ok = (result: ReturnType<typeof read>) => {
  if (!result.ok) throw new Error(`expected success, got: ${result.error}`);
  return result.value;
};

const err = (result: ReturnType<typeof read>) => {
  if (result.ok) throw new Error('expected a refusal, got success');
  return result.error;
};

describe('toBaseCurrency', () => {
  it('divides by the rate, because rate is units-per-base', () => {
    // 110 USD at 1.1 USD to the euro is 100 euro. Multiplying would say 121,
    // which is the same mistake in the same direction for every row.
    expect(toBaseCurrency(110, 1.1)).toBeCloseTo(100, 6);
    expect(toBaseCurrency(5000, 50)).toBeCloseTo(100, 6);
  });

  it('leaves a base-currency price alone', () => {
    expect(toBaseCurrency(100, 1)).toBe(100);
  });
});

describe('matching rows to parts', () => {
  it('ignores the separators a brand prints its numbers with', () => {
    const { rows } = ok(read([{ partNumber: '0 986 424 815', price: 10 }]));

    expect(rows).toHaveLength(1);
    expect(rows[0].productId).toBe('p-bosch');
  });

  it('matches regardless of case', () => {
    expect(ok(read([{ partNumber: 'w712/75', price: 10 }])).rows[0].productId).toBe('p-mann');
  });

  it('reports a number the catalogue does not carry rather than dropping it', () => {
    const { rows, rejected } = ok(
      read([
        { partNumber: '0986424815', price: 10 },
        { partNumber: 'NOT-A-PART', price: 10 },
      ])
    );

    expect(rows).toHaveLength(1);
    expect(rejected).toEqual([
      { partNumber: 'NOT-A-PART', reason: 'No part in the catalogue matches that number.' },
    ]);
  });

  it('skips blank lines without calling them failures', () => {
    // A spreadsheet's trailing empty rows are not something to report.
    const { rows, rejected } = ok(
      read([{ partNumber: '0986424815', price: 10 }, { partNumber: '   ', price: 0 }])
    );

    expect(rows).toHaveLength(1);
    expect(rejected).toHaveLength(0);
  });
});

describe('converting what the file quoted', () => {
  it('stores the base-currency figure and keeps the original beside it', () => {
    const { rows } = ok(read([{ partNumber: '0986424815', price: 110, currency: 'USD' }]));

    expect(rows[0].price).toBe(100);
    expect(rows[0].sourcePrice).toBe(110);
    expect(rows[0].sourceCurrency).toBe('USD');
  });

  it('records no source when nothing was converted', () => {
    // A "source" repeating the stored number would imply a conversion that
    // never happened.
    const { rows } = ok(read([{ partNumber: '0986424815', price: 100, currency: 'EUR' }]));

    expect(rows[0].price).toBe(100);
    expect(rows[0].sourcePrice).toBeNull();
    expect(rows[0].sourceCurrency).toBeNull();
  });

  it('treats a missing currency column as the base currency', () => {
    const { rows } = ok(read([{ partNumber: '0986424815', price: 100 }]));

    expect(rows[0].price).toBe(100);
    expect(rows[0].sourceCurrency).toBeNull();
  });

  it('rounds the converted figure to cents', () => {
    const { rows } = ok(read([{ partNumber: '0986424815', price: 100, currency: 'USD' }]));

    expect(rows[0].price).toBe(90.91); // 100 / 1.1
  });

  it('rejects a currency nobody has set up', () => {
    const { rejected } = ok(
      read([
        { partNumber: '0986424815', price: 10, currency: 'GBP' },
        { partNumber: 'W71275', price: 10 },
      ])
    );

    expect(rejected[0].reason).toMatch(/No currency called GBP/);
  });

  it('accepts a lower-case currency code', () => {
    expect(ok(read([{ partNumber: '0986424815', price: 5000, currency: 'egp' }])).rows[0].price)
      .toBe(100);
  });
});

describe('refusals', () => {
  it('rejects a price that is not a number of zero or more', () => {
    const { rejected } = ok(
      read([
        { partNumber: '0986424815', price: 'free' },
        { partNumber: 'W71275', price: -1 },
        { partNumber: '17138616418', price: 1 },
      ])
    );

    expect(rejected).toHaveLength(2);
    expect(rejected[0].reason).toMatch(/not a number/);
  });

  it('accepts a price of zero, which is what an unpriced import lands on', () => {
    expect(ok(read([{ partNumber: '0986424815', price: 0 }])).rows[0].price).toBe(0);
  });

  it('takes the last price when a file names the same part twice, and says so', () => {
    const { rows, rejected } = ok(
      read([
        { partNumber: '0986424815', price: 10 },
        { partNumber: '0 986 424 815', price: 20 },
      ])
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].price).toBe(20);
    expect(rejected[0].reason).toMatch(/more than once/);
  });

  it('refuses a file where nothing could be used', () => {
    expect(err(read([{ partNumber: 'NOPE', price: 1 }]))).toMatch(/No part in the catalogue/);
  });

  it('blames the reason that actually explains the failure', () => {
    // Every row here matches a part. What killed the file is a currency that
    // is not set up, and saying "no part matched" would send the admin to
    // check part numbers that were never the problem.
    const message = err(
      read([
        { partNumber: '0986424815', price: 1, currency: 'GBP' },
        { partNumber: 'W71275', price: 1, currency: 'GBP' },
      ])
    );

    expect(message).toMatch(/No currency called GBP/);
    expect(message).not.toMatch(/No part in the catalogue/);
  });

  it('names the commonest reason when a file failed several ways', () => {
    const message = err(
      read([
        { partNumber: 'NOPE-1', price: 1 },
        { partNumber: 'NOPE-2', price: 1 },
        { partNumber: '0986424815', price: 'x' },
      ])
    );

    expect(message).toMatch(/Most often/);
    expect(message).toMatch(/2 of 3/);
  });

  it('refuses something that is not a list of rows', () => {
    expect(err(read(undefined))).toMatch(/list of rows/);
    expect(err(read([]))).toMatch(/no rows/);
  });
});
