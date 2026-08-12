import { describe, expect, it } from 'vitest';
import { resolvePrice, type MarkupRule, type PricingContext } from '@/lib/pricing';

/**
 * The pricing engine decides what every customer pays, and it is pure — no
 * database, no session — so it is the one part of the system that can be
 * pinned down completely.
 *
 * What these lock down is the order of operations documented at the top of
 * lib/pricing.ts: markup, then discount, then currency, each exactly once.
 * The order is not cosmetic. Discounting before markup, or converting before
 * discounting, gives a different answer for the same agreed percentages, and
 * the mistake is invisible until a customer adds up an invoice.
 */

const ctx = (over: Partial<PricingContext> = {}): PricingContext => ({
  basePrice: 100,
  supplierId: 'sup-1',
  manufacturerName: 'BOSCH',
  vehicleSystemSlug: 'brakes',
  partNumber: 'BP-1234',
  clientCategoryId: 'cat-retail',
  clientCategoryMarkupPercent: 50,
  ...over,
});

const rule = (over: Partial<MarkupRule> = {}): MarkupRule => ({
  id: 'r1',
  label: 'Rule',
  priority: 0,
  type: 'PERCENT',
  value: 10,
  active: true,
  ...over,
});

describe('falling back', () => {
  it('uses the client category default when no rule matches', () => {
    const result = resolvePrice(ctx(), []);

    expect(result.finalPrice).toBe(150);
    expect(result.appliedRule).toBe('Client category default markup');
  });

  it('ignores a rule that is switched off', () => {
    const result = resolvePrice(ctx(), [rule({ active: false, value: 500 })]);

    expect(result.finalPrice).toBe(150);
  });

  it('matches a rule with every filter left empty', () => {
    // No filters means "any", not "nothing" — this is the catalogue-wide rule.
    const result = resolvePrice(ctx(), [rule({ label: 'House markup', value: 20 })]);

    expect(result.finalPrice).toBe(120);
    expect(result.appliedRule).toBe('House markup');
  });
});

describe('choosing between rules', () => {
  it('prefers the rule with more filters set', () => {
    const broad = rule({ id: 'broad', label: 'Broad', value: 10 });
    const narrow = rule({
      id: 'narrow',
      label: 'Narrow',
      value: 80,
      supplierId: 'sup-1',
      manufacturerName: 'BOSCH',
    });

    // Order in the array must not matter; the sort decides.
    expect(resolvePrice(ctx(), [broad, narrow]).appliedRule).toBe('Narrow');
    expect(resolvePrice(ctx(), [narrow, broad]).appliedRule).toBe('Narrow');
  });

  it('breaks a tie on specificity with priority, highest first', () => {
    const low = rule({ id: 'low', label: 'Low', supplierId: 'sup-1', priority: 1, value: 10 });
    const high = rule({ id: 'high', label: 'High', supplierId: 'sup-1', priority: 9, value: 80 });

    expect(resolvePrice(ctx(), [low, high]).appliedRule).toBe('High');
    expect(resolvePrice(ctx(), [high, low]).appliedRule).toBe('High');
  });

  it('counts a price band as one filter however many ends it has', () => {
    // from+to is still one concept, so it must not out-specify a rule with a
    // genuinely separate second filter.
    const band = rule({ id: 'band', label: 'Band', purchasePriceFrom: 1, purchasePriceTo: 500 });
    const two = rule({
      id: 'two',
      label: 'Two filters',
      supplierId: 'sup-1',
      manufacturerName: 'BOSCH',
    });

    expect(resolvePrice(ctx(), [band, two]).appliedRule).toBe('Two filters');
  });
});

describe('the filters themselves', () => {
  it('matches a client category, and rejects another', () => {
    const r = rule({ label: 'Tier', clientCategoryId: 'cat-trade', value: 80 });

    expect(resolvePrice(ctx({ clientCategoryId: 'cat-trade' }), [r]).appliedRule).toBe('Tier');
    expect(resolvePrice(ctx({ clientCategoryId: 'cat-retail' }), [r]).appliedRule).toBe(
      'Client category default markup'
    );
  });

  it('compares a manufacturer without regard to case', () => {
    const r = rule({ label: 'Brand', manufacturerName: 'bosch', value: 80 });

    expect(resolvePrice(ctx({ manufacturerName: 'BOSCH' }), [r]).appliedRule).toBe('Brand');
  });

  it('compares a part-number prefix without regard to case', () => {
    const r = rule({ label: 'Prefix', partNumberPrefix: 'bp-', value: 80 });

    expect(resolvePrice(ctx({ partNumber: 'BP-1234' }), [r]).appliedRule).toBe('Prefix');
    expect(resolvePrice(ctx({ partNumber: 'XX-1234' }), [r]).appliedRule).toBe(
      'Client category default markup'
    );
  });

  it('matches a supplier and a vehicle system exactly', () => {
    const r = rule({ label: 'Both', supplierId: 'sup-1', vehicleSystemSlug: 'brakes', value: 80 });

    expect(resolvePrice(ctx(), [r]).appliedRule).toBe('Both');
    expect(resolvePrice(ctx({ vehicleSystemSlug: 'cooling' }), [r]).appliedRule).toBe(
      'Client category default markup'
    );
    expect(resolvePrice(ctx({ supplierId: 'sup-2' }), [r]).appliedRule).toBe(
      'Client category default markup'
    );
  });

  it('treats both ends of a price band as inclusive', () => {
    const r = rule({ label: 'Band', purchasePriceFrom: 100, purchasePriceTo: 200, value: 80 });

    expect(resolvePrice(ctx({ basePrice: 100 }), [r]).appliedRule).toBe('Band');
    expect(resolvePrice(ctx({ basePrice: 200 }), [r]).appliedRule).toBe('Band');
    expect(resolvePrice(ctx({ basePrice: 99.99 }), [r]).appliedRule).toBe(
      'Client category default markup'
    );
    expect(resolvePrice(ctx({ basePrice: 200.01 }), [r]).appliedRule).toBe(
      'Client category default markup'
    );
  });

  it('applies an open-ended band from one side only', () => {
    const floor = rule({ label: 'Expensive', purchasePriceFrom: 150, value: 80 });

    expect(resolvePrice(ctx({ basePrice: 200 }), [floor]).appliedRule).toBe('Expensive');
    expect(resolvePrice(ctx({ basePrice: 100 }), [floor]).appliedRule).toBe(
      'Client category default markup'
    );
  });
});

describe('the three kinds of markup', () => {
  it('adds a percentage', () => {
    expect(resolvePrice(ctx(), [rule({ type: 'PERCENT', value: 25 })]).finalPrice).toBe(125);
  });

  it('adds a flat amount', () => {
    expect(resolvePrice(ctx(), [rule({ type: 'AMOUNT', value: 25 })]).finalPrice).toBe(125);
  });

  it('sets a fixed price, ignoring what the part cost', () => {
    expect(resolvePrice(ctx(), [rule({ type: 'FIXED', value: 25 })]).finalPrice).toBe(25);
    expect(resolvePrice(ctx({ basePrice: 999 }), [rule({ type: 'FIXED', value: 25 })]).finalPrice)
      .toBe(25);
  });
});

describe('the account discount', () => {
  it('comes off the marked-up price, not the purchase price', () => {
    // 100 -> +50% = 150 -> less 10% = 135.
    // Off the purchase price first it would be 90 -> +50% = 135 too, so the
    // percentages are chosen to tell the two apart: with AMOUNT they differ.
    const result = resolvePrice(ctx({ discountPercent: 10 }), [
      rule({ label: 'Flat', type: 'AMOUNT', value: 100 }),
    ]);

    // markup first: (100 + 100) * 0.9 = 180. Discount first would be
    // (100 * 0.9) + 100 = 190.
    expect(result.finalPrice).toBe(180);
  });

  it('reduces the markup rather than cancelling it', () => {
    const result = resolvePrice(ctx({ discountPercent: 10 }), []);

    expect(result.priceBeforeDiscount).toBe(150);
    expect(result.finalPrice).toBe(135);
    expect(result.discountPercent).toBe(10);
  });

  it('says which rule won and that a discount came off it', () => {
    const result = resolvePrice(ctx({ discountPercent: 10 }), [rule({ label: 'Trade' })]);

    expect(result.appliedRule).toBe('Trade · less 10% account discount');
  });

  it('leaves the label alone when there is no discount', () => {
    expect(resolvePrice(ctx(), [rule({ label: 'Trade' })]).appliedRule).toBe('Trade');
  });

  it('refuses to turn a negative discount into a surcharge', () => {
    const result = resolvePrice(ctx({ discountPercent: -25 }), []);

    expect(result.discountPercent).toBe(0);
    expect(result.finalPrice).toBe(150);
  });

  it('will not pay the customer to take the part', () => {
    const result = resolvePrice(ctx({ discountPercent: 250 }), []);

    expect(result.discountPercent).toBe(100);
    expect(result.finalPrice).toBe(0);
  });
});

describe('currency', () => {
  const egp = { code: 'EGP', symbol: 'E£', rate: 50 };

  it('converts last, and only multiplies', () => {
    const result = resolvePrice(ctx({ currency: egp }), []);

    expect(result.finalPrice).toBe(7500); // 150 * 50
    expect(result.currencyCode).toBe('EGP');
    expect(result.currencySymbol).toBe('E£');
  });

  it('gives the same discounted answer whatever the account is quoted in', () => {
    // The point of converting last: 10% off is 10% off in every currency.
    const base = resolvePrice(ctx({ discountPercent: 10 }), []);
    const converted = resolvePrice(ctx({ discountPercent: 10, currency: egp }), []);

    expect(base.netBase).toBe(135);
    expect(converted.netBase).toBe(135);
    expect(converted.finalPrice).toBe(base.netBase * 50);
  });

  it('keeps netBase in the base currency, which is what an order stores', () => {
    const result = resolvePrice(ctx({ currency: egp }), []);

    expect(result.netBase).toBe(150);
    expect(result.finalPrice).toBe(7500);
  });

  it('quotes in euro when the account has no currency of its own', () => {
    const result = resolvePrice(ctx(), []);

    expect(result.currencyCode).toBe('EUR');
    expect(result.currencySymbol).toBe('€');
  });

  it('converts the pre-discount price too, so a quote adds up', () => {
    const result = resolvePrice(ctx({ discountPercent: 10, currency: egp }), []);

    expect(result.priceBeforeDiscount).toBe(7500);
    expect(result.finalPrice).toBe(6750);
  });
});

describe('margin', () => {
  it('reports the margin over the purchase price, in the base currency', () => {
    expect(resolvePrice(ctx(), []).marginPercent).toBe(50);
  });

  it('does not move when the account is quoted in another currency', () => {
    const result = resolvePrice(ctx({ currency: { code: 'EGP', symbol: 'E£', rate: 50 } }), []);

    expect(result.marginPercent).toBe(50);
  });

  it('goes negative when a fixed price sells below cost', () => {
    const result = resolvePrice(ctx(), [rule({ type: 'FIXED', value: 80 })]);

    expect(result.marginPercent).toBe(-20);
  });

  it('says zero rather than dividing by a purchase price of zero', () => {
    // Newly imported TecDoc articles land with basePrice 0 until a supplier
    // price list gives them one, so this is a real row, not a hypothetical.
    const result = resolvePrice(ctx({ basePrice: 0 }), []);

    expect(result.marginPercent).toBe(0);
    expect(Number.isNaN(result.marginPercent)).toBe(false);
  });
});

describe('rounding', () => {
  it('rounds money to cents', () => {
    const result = resolvePrice(ctx({ basePrice: 6.85, clientCategoryMarkupPercent: 0 }), []);

    expect(result.finalPrice).toBe(6.85);
  });

  it('rounds a repeating result rather than passing the drift on', () => {
    const result = resolvePrice(ctx({ basePrice: 10, clientCategoryMarkupPercent: 33.333 }), []);

    expect(result.finalPrice).toBe(13.33);
  });
});
