import { describe, expect, it } from 'vitest';
import { readStockRows, readWarehouseInput } from '@/lib/admin-inventory';
import { readImageRows, readProductInput } from '@/lib/admin-products';
import { normalisePartNumber } from '@/lib/part-number';
import { isReliability, RELIABILITIES } from '@/lib/supplier-classification';

/**
 * The validators every admin write goes through.
 *
 * They are the last thing between a request body and a row, so what matters
 * is the refusals: each one below is a body that must not reach the database.
 * The database would catch some of them anyway — these exist so the admin
 * gets a sentence instead of a constraint violation.
 */

const ok = <T>(result: { ok: true; value: T } | { ok: false; error: string }): T => {
  if (!result.ok) throw new Error(`expected success, got: ${result.error}`);
  return result.value;
};

const err = (result: { ok: boolean; error?: string }): string => {
  if (result.ok) throw new Error('expected a refusal, got success');
  return result.error!;
};

describe('stock rows', () => {
  const row = (over: Record<string, unknown> = {}) => ({
    warehouseId: 'w1',
    quantity: 5,
    reserved: 0,
    ...over,
  });

  it('accepts a plain count', () => {
    const rows = ok(readStockRows({ levels: [row()] }));

    expect(rows).toEqual([{ warehouseId: 'w1', quantity: 5, reserved: 0, binLocation: null }]);
  });

  it('refuses to promise more than is on the shelf', () => {
    // Mirrors the CHECK constraint. The easy way to reach it is editing
    // quantity downwards while a reservation is already standing.
    expect(err(readStockRows({ levels: [row({ quantity: 2, reserved: 5 })] }))).toMatch(
      /Reserved cannot exceed/
    );
  });

  it('allows reserving exactly what is there', () => {
    expect(ok(readStockRows({ levels: [row({ quantity: 5, reserved: 5 })] }))).toHaveLength(1);
  });

  it('names the duplicate rather than letting the unique key surface', () => {
    expect(err(readStockRows({ levels: [row(), row()] }))).toMatch(/appears twice/);
  });

  it('refuses fractional and negative counts', () => {
    expect(err(readStockRows({ levels: [row({ quantity: 1.5 })] }))).toMatch(/whole number/);
    expect(err(readStockRows({ levels: [row({ quantity: -1 })] }))).toMatch(/whole number/);
    expect(err(readStockRows({ levels: [row({ reserved: -1 })] }))).toMatch(/whole number/);
  });

  it('requires a warehouse on every row', () => {
    expect(err(readStockRows({ levels: [row({ warehouseId: '' })] }))).toMatch(/needs a warehouse/);
  });

  it('refuses anything that is not a list of objects', () => {
    expect(err(readStockRows({}))).toMatch(/list of stock levels/);
    expect(err(readStockRows({ levels: 'all of them' }))).toMatch(/list of stock levels/);
    expect(err(readStockRows({ levels: [null] }))).toMatch(/must be an object/);
  });

  it('takes an empty list, which is how a part stops being held anywhere', () => {
    expect(ok(readStockRows({ levels: [] }))).toEqual([]);
  });

  it('reads a blank bin location as none', () => {
    expect(ok(readStockRows({ levels: [row({ binLocation: '   ' })] }))[0].binLocation).toBeNull();
  });
});

describe('warehouse input', () => {
  const input = (over: Record<string, unknown> = {}) => ({ code: 'eu1', name: 'Rotterdam', ...over });

  it('stores the code uppercased, since codes are compared by eye', () => {
    expect(ok(readWarehouseInput(input())).code).toBe('EU1');
  });

  it('requires a code and a name', () => {
    expect(err(readWarehouseInput(input({ code: '  ' })))).toMatch(/code is required/);
    expect(err(readWarehouseInput(input({ name: '' })))).toMatch(/name is required/);
  });

  it('reads a blank priority as the default rather than as NaN', () => {
    expect(ok(readWarehouseInput(input({ priority: '' }))).priority).toBe(0);
    expect(ok(readWarehouseInput(input())).priority).toBe(0);
  });

  it('refuses a fractional priority', () => {
    expect(err(readWarehouseInput(input({ priority: 1.5 })))).toMatch(/whole number/);
  });

  it('is active unless something explicitly says otherwise', () => {
    expect(ok(readWarehouseInput(input())).active).toBe(true);
    expect(ok(readWarehouseInput(input({ active: false }))).active).toBe(false);
  });
});

describe('product input', () => {
  const input = (over: Record<string, unknown> = {}) => ({
    partNumber: 'BP-1',
    name: 'Brake pad',
    manufacturerId: 'm1',
    vehicleSystemId: 'v1',
    basePrice: 10,
    ...over,
  });

  it('requires the fields a part cannot exist without', () => {
    expect(err(readProductInput(input({ partNumber: '' })))).toMatch(/Part number/);
    expect(err(readProductInput(input({ name: '' })))).toMatch(/Name/);
    expect(err(readProductInput(input({ manufacturerId: '' })))).toMatch(/manufacturer/);
    expect(err(readProductInput(input({ vehicleSystemId: '' })))).toMatch(/vehicle system/);
  });

  it('accepts a purchase price of zero, which is what an import lands on', () => {
    // TecDoc carries no prices, so a freshly imported article has basePrice 0
    // until a supplier price list gives it one. Refusing zero would refuse it.
    expect(ok(readProductInput(input({ basePrice: 0 }))).basePrice).toBe(0);
  });

  it('refuses a negative or unparseable purchase price', () => {
    expect(err(readProductInput(input({ basePrice: -1 })))).toMatch(/zero or more/);
    expect(err(readProductInput(input({ basePrice: 'free' })))).toMatch(/zero or more/);
  });

  it('reads blank delivery days as "inherit from the supplier"', () => {
    expect(ok(readProductInput(input({ stockDays: '' }))).stockDays).toBeNull();
    expect(ok(readProductInput(input())).stockDays).toBeNull();
    expect(ok(readProductInput(input({ stockDays: 3 }))).stockDays).toBe(3);
  });
});

describe('product images', () => {
  it('accepts http, https and a site-relative path', () => {
    const rows = ok(
      readImageRows({
        images: [
          { url: 'https://cdn.example.com/a.jpg' },
          { url: 'http://cdn.example.com/b.jpg' },
          { url: '/uploads/c.jpg' },
        ],
      })
    );

    expect(rows).toHaveLength(3);
  });

  it('refuses the schemes that would execute or embed', () => {
    // These end up in an <img src> on a public page, so they are refused here
    // rather than sanitised at each place that renders one.
    expect(err(readImageRows({ images: [{ url: 'javascript:alert(1)' }] }))).toMatch(/must start/);
    expect(err(readImageRows({ images: [{ url: 'data:image/png;base64,AAA' }] }))).toMatch(/must start/);
    expect(err(readImageRows({ images: [{ url: 'blob:abc' }] }))).toMatch(/must start/);
  });

  // The check is `url.startsWith('/')`, and a protocol-relative URL starts
  // with '/' too — so //evil.com/a.jpg is accepted and the browser fetches it
  // off-site, which is exactly what the scheme check above exists to stop.
  // Left failing-by-omission rather than asserted as correct: writing the
  // current behaviour into a test would make the bug the specification.
  it.todo('refuses a protocol-relative url such as //evil.com/a.jpg');

  it('caps how many pictures a part can carry', () => {
    const many = Array.from({ length: 13 }, (_, i) => ({ url: `/img/${i}.jpg` }));

    expect(err(readImageRows({ images: many }))).toMatch(/at most 12/);
  });

  it('requires a url on every row and refuses an over-long one', () => {
    expect(err(readImageRows({ images: [{ url: '' }] }))).toMatch(/needs a url/);
    expect(err(readImageRows({ images: [{ url: `/${'a'.repeat(2048)}` }] }))).toMatch(/too long/);
  });

  it('reads a blank alt as none, so the part name can stand in', () => {
    expect(ok(readImageRows({ images: [{ url: '/a.jpg', alt: '  ' }] }))[0].alt).toBeNull();
  });
});

describe('part numbers', () => {
  it('ignores whatever separators a brand prints', () => {
    // The four shapes named in lib/part-number.ts, all typed back differently.
    expect(normalisePartNumber('0 986 424 815')).toBe('0986424815');
    expect(normalisePartNumber('09.9772.11')).toBe('09977211');
    expect(normalisePartNumber('24.5219-0713.3')).toBe('24521907133');
    expect(normalisePartNumber('W 712/75')).toBe('W71275');
  });

  it('makes the same number typed two ways compare equal', () => {
    expect(normalisePartNumber('17138616418')).toBe(normalisePartNumber('171-386.164 18'));
  });

  it('upper-cases, so case cannot split a match', () => {
    expect(normalisePartNumber('w712/75')).toBe('W71275');
  });

  it('survives a string with nothing usable in it', () => {
    expect(normalisePartNumber('---')).toBe('');
    expect(normalisePartNumber('')).toBe('');
  });
});

describe('supplier reliability', () => {
  it('is ranked strongest relationship first', () => {
    expect(RELIABILITIES).toEqual(['official', 'dealer', 'reliable', 'standard']);
  });

  it('recognises exactly the four values and nothing else', () => {
    for (const value of RELIABILITIES) expect(isReliability(value)).toBe(true);

    expect(isReliability('Official')).toBe(false);
    expect(isReliability('trusted')).toBe(false);
    expect(isReliability('')).toBe(false);
  });
});
