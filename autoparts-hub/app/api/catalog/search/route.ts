import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { loadPricingContext, priceFor, searchWhere } from '@/lib/catalog';

// GET /api/catalog/search?q=<part number or name>&system=<slug>
// Prices come from the caller's own session tier — see loadPricingContext.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim() ?? '';
  const system = searchParams.get('system')?.trim() || undefined;

  const [products, systemRecord, ctx] = await Promise.all([
    prisma.product.findMany({
      where: searchWhere(q, system),
      include: { manufacturer: true, vehicleSystem: true },
      // Enough to return a whole system, or the unfiltered catalogue, without
      // silently cutting results off. Needs real paging well before this.
      take: 200,
    }),
    system ? prisma.vehicleSystem.findUnique({ where: { slug: system } }) : Promise.resolve(null),
    loadPricingContext(),
  ]);

  return NextResponse.json({
    query: q,
    systemName: systemRecord?.name ?? null,
    tierName: ctx.tierName,
    isLoggedIn: ctx.isLoggedIn,
    count: products.length,
    products: products.map((p) => {
      const pricing = priceFor(p, ctx);
      return {
        id: p.id,
        partNumber: p.partNumber,
        name: p.name,
        manufacturer: p.manufacturer.name,
        system: p.vehicleSystem.name,
        systemSlug: p.vehicleSystem.slug,
        stockDays: p.stockDays,
        price: pricing?.finalPrice ?? p.basePrice,
        appliedRule: pricing?.appliedRule ?? null,
      };
    }),
  });
}
