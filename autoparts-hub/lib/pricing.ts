/**
 * Pricing engine
 * ---------------
 * Resolves the final client-facing price for a (client, product) pair.
 *
 * Order of operations. Each concept applies exactly once, in this order:
 *
 *   purchase price
 *     -> markup   the most specific matching rule, else the tier default
 *     -> discount the account's negotiated percentage, off the marked-up price
 *     -> currency converted into what the account is quoted in
 *
 * Markup mirrors the "Complex markup" rule builder shown in the source
 * system: a rule can filter on client category, supplier, manufacturer,
 * vehicle system, part-number prefix, and a purchase-price band. Any filter
 * left empty means "any". When several rules match, the MOST SPECIFIC one
 * wins (most non-null filters), and `priority` breaks ties. If no rule
 * matches, the client's category default markup applies.
 *
 * Discount is deliberately a separate step rather than another rule type.
 * Inside the engine it would have had to either beat the markup or lose to
 * it, since only one rule can win — and a discount that cancels the markup
 * instead of reducing it is not what "10% off" means. Kept outside, the two
 * compose: the tier decides the price, the account's discount comes off it.
 *
 * Currency is last, and only ever multiplies. Discounting after conversion
 * would give a different answer per currency for the same agreed percentage.
 */

export type MarkupType = 'PERCENT' | 'AMOUNT' | 'FIXED';

export interface MarkupRule {
  id: string;
  label: string;
  priority: number;
  clientCategoryId?: string | null;
  supplierId?: string | null;
  manufacturerName?: string | null;
  vehicleSystemSlug?: string | null;
  partNumberPrefix?: string | null;
  purchasePriceFrom?: number | null;
  purchasePriceTo?: number | null;
  type: MarkupType;
  value: number;
  active: boolean;
}

export interface PricingContext {
  basePrice: number;          // supplier purchase price, in the base currency
  supplierId: string;
  manufacturerName: string;
  vehicleSystemSlug: string;
  partNumber: string;
  clientCategoryId: string;
  clientCategoryMarkupPercent: number; // fallback default
  /** The account's negotiated discount, off the marked-up price. */
  discountPercent?: number;
  /** What the account is quoted in. Absent means the base currency. */
  currency?: PricingCurrency;
}

/** Enough of a Currency row to convert and label a price. */
export interface PricingCurrency {
  code: string;
  symbol: string;
  /** Units of this currency per one unit of the base. 1 on the base. */
  rate: number;
}

export interface PriceResult {
  basePrice: number;
  /** What the customer is quoted: after discount, in their currency. */
  finalPrice: number;
  /**
   * The same price after discount but before conversion, in the base
   * currency. This is the figure to store and to compare against anything
   * else denominated in the base — an order's line prices, a tier's minimum
   * order — since those cannot be read against a total that changes with
   * whichever currency the account happens to be set to.
   */
  netBase: number;
  appliedRule: string;        // human readable — which rule / default won
  marginPercent: number;
  /** The discount taken off, so a quote can show it rather than imply it. */
  discountPercent: number;
  /** Price before the discount, in the quoted currency. */
  priceBeforeDiscount: number;
  currencyCode: string;
  currencySymbol: string;
}

function ruleMatches(rule: MarkupRule, ctx: PricingContext): boolean {
  if (!rule.active) return false;

  if (rule.clientCategoryId && rule.clientCategoryId !== ctx.clientCategoryId) return false;
  if (rule.supplierId && rule.supplierId !== ctx.supplierId) return false;
  if (rule.manufacturerName && rule.manufacturerName.toUpperCase() !== ctx.manufacturerName.toUpperCase()) return false;
  if (rule.vehicleSystemSlug && rule.vehicleSystemSlug !== ctx.vehicleSystemSlug) return false;
  if (rule.partNumberPrefix && !ctx.partNumber.toUpperCase().startsWith(rule.partNumberPrefix.toUpperCase())) return false;
  if (rule.purchasePriceFrom != null && ctx.basePrice < rule.purchasePriceFrom) return false;
  if (rule.purchasePriceTo != null && ctx.basePrice > rule.purchasePriceTo) return false;

  return true;
}

function specificity(rule: MarkupRule): number {
  return [
    rule.clientCategoryId,
    rule.supplierId,
    rule.manufacturerName,
    rule.vehicleSystemSlug,
    rule.partNumberPrefix,
    rule.purchasePriceFrom != null || rule.purchasePriceTo != null ? 'range' : null,
  ].filter(Boolean).length;
}

function applyMarkup(basePrice: number, type: MarkupType, value: number): number {
  switch (type) {
    case 'PERCENT':
      return basePrice * (1 + value / 100);
    case 'AMOUNT':
      return basePrice + value;
    case 'FIXED':
      return value;
  }
}

/** The base currency, for accounts that are quoted in it. */
const BASE_CURRENCY: PricingCurrency = { code: 'EUR', symbol: '€', rate: 1 };

const round = (value: number) => Math.round(value * 100) / 100;

export function resolvePrice(ctx: PricingContext, rules: MarkupRule[]): PriceResult {
  const candidates = rules.filter((r) => ruleMatches(r, ctx));

  candidates.sort((a, b) => {
    const specDiff = specificity(b) - specificity(a);
    if (specDiff !== 0) return specDiff;
    return b.priority - a.priority;
  });

  const winner = candidates[0];

  // 1. Markup — one winner, as before.
  const markedUp = winner
    ? applyMarkup(ctx.basePrice, winner.type, winner.value)
    : applyMarkup(ctx.basePrice, 'PERCENT', ctx.clientCategoryMarkupPercent);

  // 2. Discount. Clamped to 0–100: a negative one would quietly become a
  //    surcharge, and over 100 would pay the customer to take the part.
  const discountPercent = Math.min(100, Math.max(0, ctx.discountPercent ?? 0));
  const discounted = markedUp * (1 - discountPercent / 100);

  // 3. Currency, last and multiplicative only.
  const currency = ctx.currency ?? BASE_CURRENCY;
  const finalPrice = round(discounted * currency.rate);

  // Margin stays a fact about the sale in the base currency: converting it
  // would leave the number unchanged but invite reading it as a rate.
  const marginPercent = ctx.basePrice > 0
    ? Math.round(((round(discounted) - ctx.basePrice) / ctx.basePrice) * 1000) / 10
    : 0;

  const markupLabel = winner ? winner.label : 'Client category default markup';

  return {
    basePrice: ctx.basePrice,
    finalPrice,
    netBase: round(discounted),
    appliedRule: discountPercent > 0
      ? `${markupLabel} · less ${discountPercent}% account discount`
      : markupLabel,
    marginPercent,
    discountPercent,
    priceBeforeDiscount: round(markedUp * currency.rate),
    currencyCode: currency.code,
    currencySymbol: currency.symbol,
  };
}
