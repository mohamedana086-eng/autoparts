import { describe, expect, it } from 'vitest';
import { mergeBaskets, type CartItem } from './cart.service';
import type { SavedBasketLine } from './api.models';

/**
 * What signing in does to a basket.
 *
 * The rule has to hold in both directions at once: nothing the customer added
 * while signed out may be lost, and nothing saved on another device may be
 * lost either. The quantity case is the subtle one — taking the larger rather
 * than the sum is what stops a basket that syncs twice from doubling itself.
 */

const local = (over: Partial<CartItem> = {}): CartItem => ({
  id: 'p1',
  partNumber: 'BP-1',
  name: 'Brake pad',
  manufacturer: 'BOSCH',
  unitPrice: 100,
  stockDays: 3,
  qty: 1,
  // High by default so the merge tests exercise merging rather than capping;
  // the cases that care about the ceiling set it themselves.
  available: 999,
  ...over,
});

const saved = (over: Partial<SavedBasketLine> = {}): SavedBasketLine => ({
  productId: 'p1',
  partNumber: 'BP-1',
  name: 'Brake pad',
  manufacturer: 'BOSCH',
  stockDays: 3,
  unitPrice: 80,
  quantity: 1,
  available: 999,
  ...over,
});

describe('mergeBaskets', () => {
  it('keeps a basket built while signed out', () => {
    const merged = mergeBaskets([local({ id: 'p1' }), local({ id: 'p2' })], []);

    expect(merged.map((i) => i.id)).toEqual(['p1', 'p2']);
  });

  it('brings back a basket saved on another device', () => {
    const merged = mergeBaskets([], [saved({ productId: 'p9', partNumber: 'BP-9' })]);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ id: 'p9', partNumber: 'BP-9', qty: 1 });
  });

  it('unions the two rather than letting either replace the other', () => {
    const merged = mergeBaskets([local({ id: 'local-only' })], [saved({ productId: 'server-only' })]);

    expect(merged.map((i) => i.id).sort()).toEqual(['local-only', 'server-only']);
  });

  it('takes the larger quantity, not the sum, when both know a part', () => {
    // The failure this prevents: sign in on the same device twice and every
    // agreed line quietly doubles.
    expect(mergeBaskets([local({ qty: 2 })], [saved({ quantity: 5 })])[0].qty).toBe(5);
    expect(mergeBaskets([local({ qty: 5 })], [saved({ quantity: 2 })])[0].qty).toBe(5);
    expect(mergeBaskets([local({ qty: 3 })], [saved({ quantity: 3 })])[0].qty).toBe(3);
  });

  it('takes the price the server resolved, not the one cached while anonymous', () => {
    // The local copy may have been priced at Retail before signing in; the
    // server figure was resolved against the account's own tier just now.
    const merged = mergeBaskets([local({ unitPrice: 100 })], [saved({ unitPrice: 80 })]);

    expect(merged[0].unitPrice).toBe(80);
  });

  it('fills in the description fields for a part only the server knew', () => {
    const merged = mergeBaskets(
      [],
      [saved({ productId: 'p2', partNumber: 'W-712', name: 'Oil filter', manufacturer: 'MANN', stockDays: 9 })]
    );

    expect(merged[0]).toEqual({
      id: 'p2',
      partNumber: 'W-712',
      name: 'Oil filter',
      manufacturer: 'MANN',
      stockDays: 9,
      unitPrice: 80,
      qty: 1,
      available: 999,
    });
  });

  it('holds both sides to the quantity ceiling', () => {
    expect(mergeBaskets([], [saved({ quantity: 5000 })])[0].qty).toBe(999);
    expect(mergeBaskets([local({ qty: 10 })], [saved({ quantity: 5000 })])[0].qty).toBe(999);
  });

  it('leaves an empty basket empty', () => {
    expect(mergeBaskets([], [])).toEqual([]);
  });

  it('holds a merged line to what the part actually has', () => {
    // A basket saved when there were ten has no claim on a shelf down to two.
    const merged = mergeBaskets([local({ qty: 10 })], [saved({ quantity: 10, available: 2 })]);

    expect(merged[0].qty).toBe(2);
  });

  it('drops a line for a part that sold out while the basket sat', () => {
    // A line for none of something is not a line.
    expect(mergeBaskets([local({ qty: 3 })], [saved({ quantity: 3, available: 0 })])).toEqual([]);
  });
});
