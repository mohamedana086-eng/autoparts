/**
 * Pricing engine
 * ---------------
 * Resolves the final client-facing price for a (client, product) pair.
 *
 * Mirrors the "Complex markup" rule builder shown in the source system:
 * a rule can filter on client category, supplier, manufacturer, vehicle
 * system, part-number prefix, and a purchase-price band. Any filter left
 * empty means "any". When several rules match, the MOST SPECIFIC one wins
 * (most non-null filters), and `priority` breaks ties.
 *
 * If no rule matches, the client's category default markup applies.
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
  basePrice: number;          // supplier purchase price
  supplierId: string;
  manufacturerName: string;
  vehicleSystemSlug: string;
  partNumber: string;
  clientCategoryId: string;
  clientCategoryMarkupPercent: number; // fallback default
}

export interface PriceResult {
  basePrice: number;
  finalPrice: number;
  appliedRule: string;        // human readable — which rule / default won
  marginPercent: number;
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

export function resolvePrice(ctx: PricingContext, rules: MarkupRule[]): PriceResult {
  const candidates = rules.filter((r) => ruleMatches(r, ctx));

  candidates.sort((a, b) => {
    const specDiff = specificity(b) - specificity(a);
    if (specDiff !== 0) return specDiff;
    return b.priority - a.priority;
  });

  const winner = candidates[0];

  const finalPrice = winner
    ? applyMarkup(ctx.basePrice, winner.type, winner.value)
    : applyMarkup(ctx.basePrice, 'PERCENT', ctx.clientCategoryMarkupPercent);

  const rounded = Math.round(finalPrice * 100) / 100;
  const marginPercent = ctx.basePrice > 0
    ? Math.round(((rounded - ctx.basePrice) / ctx.basePrice) * 1000) / 10
    : 0;

  return {
    basePrice: ctx.basePrice,
    finalPrice: rounded,
    appliedRule: winner ? winner.label : 'Client category default markup',
    marginPercent,
  };
}
