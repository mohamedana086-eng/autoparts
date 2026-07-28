import 'server-only';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { resolvePrice, type MarkupRule, type PriceResult } from '@/lib/pricing';

/**
 * Pricing context for a catalog request.
 *
 * The tier is taken from the signed-in session, never from a client-supplied
 * id — otherwise anyone could ask for another account's negotiated prices by
 * passing its id.
 */
export interface PricingContext {
  category: { id: string; name: string; markupPercent: number } | null;
  rules: MarkupRule[];
  defaultSupplierId: string;
  tierName: string;
  isLoggedIn: boolean;
}

export async function loadPricingContext(): Promise<PricingContext> {
  const session = await getSession();

  const category = session?.categoryId
    ? await prisma.clientCategory.findUnique({ where: { id: session.categoryId } })
    : await prisma.clientCategory.findFirst({ where: { name: 'Retail' } });

  const [rules, supplier] = await Promise.all([
    prisma.markupRule.findMany({ where: { active: true } }),
    prisma.supplier.findFirst(),
  ]);

  return {
    category: category
      ? { id: category.id, name: category.name, markupPercent: category.markupPercent }
      : null,
    rules: rules as unknown as MarkupRule[],
    defaultSupplierId: supplier?.id ?? '',
    tierName: category?.name ?? 'Retail',
    isLoggedIn: !!session,
  };
}

interface PriceableProduct {
  basePrice: number;
  partNumber: string;
  manufacturer: { name: string };
  vehicleSystem: { slug: string };
}

export function priceFor(product: PriceableProduct, ctx: PricingContext): PriceResult | null {
  if (!ctx.category) return null;

  return resolvePrice(
    {
      basePrice: product.basePrice,
      supplierId: ctx.defaultSupplierId,
      manufacturerName: product.manufacturer.name,
      vehicleSystemSlug: product.vehicleSystem.slug,
      partNumber: product.partNumber,
      clientCategoryId: ctx.category.id,
      clientCategoryMarkupPercent: ctx.category.markupPercent,
    },
    ctx.rules
  );
}

/** Free-text catalog search. `mode: 'insensitive'` is required on Postgres,
 *  where `contains` is a case-sensitive LIKE. */
export function searchWhere(q: string, system?: string) {
  return {
    AND: [
      q
        ? {
            OR: [
              { partNumber: { contains: q, mode: 'insensitive' as const } },
              { name: { contains: q, mode: 'insensitive' as const } },
            ],
          }
        : {},
      system ? { vehicleSystem: { slug: system } } : {},
    ],
  };
}
