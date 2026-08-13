import { describe, expect, it } from 'vitest';
import { availabilityOf, sellableQuantity } from '@/lib/catalog';

/**
 * Whether a part can be sold from stock.
 *
 * One distinction carries the whole thing: never counted is not the same as
 * counted and gone. Collapsing the two takes every part nobody has counted off
 * sale, which today is the entire catalogue — so it is asserted here rather
 * than left to the shape of an `if` somewhere in a template.
 */
describe('availabilityOf', () => {
  it('says nothing about a part nobody has counted', () => {
    expect(availabilityOf({})).toBeNull();
    expect(availabilityOf({ stock: [] })).toBeNull();
  });

  it('does not read never-counted as none left', () => {
    // The line that matters: null and 0 must not compare equal, because one
    // sells on its lead time and the other cannot be sold at all.
    expect(availabilityOf({ stock: [] })).not.toBe(0);
  });

  it('counts what is on the shelf', () => {
    expect(availabilityOf({ stock: [{ quantity: 7, reserved: 0 }] })).toBe(7);
  });

  it('adds warehouses together', () => {
    expect(
      availabilityOf({ stock: [{ quantity: 3, reserved: 0 }, { quantity: 2, reserved: 0 }] })
    ).toBe(5);
  });

  it('does not offer what is already promised to an order', () => {
    expect(availabilityOf({ stock: [{ quantity: 5, reserved: 2 }] })).toBe(3);
  });

  it('reports zero when a counted part is fully spoken for', () => {
    // Counted, and none to sell — which is a real answer, unlike null.
    expect(availabilityOf({ stock: [{ quantity: 4, reserved: 4 }] })).toBe(0);
  });

  it('reports zero for a counted part with an empty shelf', () => {
    expect(availabilityOf({ stock: [{ quantity: 0, reserved: 0 }] })).toBe(0);
  });

  it('nets a shortfall in one warehouse against another', () => {
    // reserved <= quantity is a database constraint per row, so a negative
    // row cannot occur; summing is still the right operation across rows.
    expect(
      availabilityOf({ stock: [{ quantity: 1, reserved: 1 }, { quantity: 6, reserved: 2 }] })
    ).toBe(4);
  });
});

/**
 * What may actually be sold.
 *
 * Stock is the authority: an uncounted part has nothing to sell. The two
 * facts stay distinct in `availabilityOf` because an admin needs to tell an
 * unfilled record from an empty shelf — but nothing a customer can do turns
 * on which it is, and that collapse happens here and nowhere else.
 */
describe('sellableQuantity', () => {
  it('sells nothing from a part nobody has counted', () => {
    expect(sellableQuantity({})).toBe(0);
    expect(sellableQuantity({ stock: [] })).toBe(0);
  });

  it('sells nothing from a counted part that has run out', () => {
    expect(sellableQuantity({ stock: [{ quantity: 4, reserved: 4 }] })).toBe(0);
  });

  it('gives the two the same answer, though they are different facts', () => {
    // The policy in one line: an unfilled record and an empty shelf are the
    // same to a buyer.
    expect(sellableQuantity({ stock: [] })).toBe(sellableQuantity({ stock: [{ quantity: 0, reserved: 0 }] }));
    expect(availabilityOf({ stock: [] })).not.toBe(availabilityOf({ stock: [{ quantity: 0, reserved: 0 }] }));
  });

  it('sells what is on the shelf and not what is promised', () => {
    expect(sellableQuantity({ stock: [{ quantity: 10, reserved: 0 }] })).toBe(10);
    expect(sellableQuantity({ stock: [{ quantity: 10, reserved: 4 }] })).toBe(6);
  });
});
