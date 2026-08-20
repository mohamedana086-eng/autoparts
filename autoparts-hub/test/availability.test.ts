import { describe, expect, it } from 'vitest';
import { sellableQuantity } from '@/lib/catalog';

/**
 * Whether a part can be sold from stock.
 *
 * One distinction carries the whole thing: never counted is not the same as
 * counted and gone. The queries keep them apart — `SUM` over no shelves is
 * null, and null travels all the way out to the catalogue's responses so an
 * admin can tell an unfilled record from an empty shelf.
 *
 * Nothing a customer can do turns on which it is, and that collapse happens in
 * exactly one function. It used to add up a list of shelves as well; the
 * database does that now, so what is left here is the policy, which is the
 * part worth asserting. Collapsing the two the other way — reading uncounted
 * as "sell on the lead time" — would put the entire catalogue on sale, so it
 * is pinned here rather than left to the shape of an `if` in a template.
 */
describe('sellableQuantity', () => {
  it('sells nothing from a part nobody has counted', () => {
    expect(sellableQuantity(null)).toBe(0);
  });

  it('sells nothing from a counted part that has run out', () => {
    expect(sellableQuantity(0)).toBe(0);
  });

  it('gives the two the same answer, though they are different facts', () => {
    // The policy in one line: an unfilled record and an empty shelf are the
    // same to a buyer, even though the responses keep reporting them apart.
    expect(sellableQuantity(null)).toBe(sellableQuantity(0));
  });

  it('sells what the query counted', () => {
    expect(sellableQuantity(10)).toBe(10);
    expect(sellableQuantity(6)).toBe(6);
  });

  it('passes a count through untouched rather than reinterpreting it', () => {
    // What is promised to an order is already netted off by the query. Doing
    // it again here would take the reserved units off twice.
    for (const n of [1, 3, 7, 954]) expect(sellableQuantity(n)).toBe(n);
  });
});
