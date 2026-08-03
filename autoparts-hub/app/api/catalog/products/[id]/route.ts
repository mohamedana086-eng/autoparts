import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { loadPricingContext, priceFor } from '@/lib/catalog';

// GET /api/catalog/products/<id> — detail view, priced for the caller's tier.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const product = await prisma.product.findUnique({
    where: { id: params.id },
    include: { manufacturer: true, vehicleSystem: true, interchanges: true, supplier: true },
  });

  if (!product) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 });
  }

  const ctx = await loadPricingContext();
  const pricing = priceFor(product, ctx);

  return NextResponse.json({
    tierName: ctx.tierName,
    isLoggedIn: ctx.isLoggedIn,
    product: {
      id: product.id,
      partNumber: product.partNumber,
      name: product.name,
      description: product.description,
      manufacturer: product.manufacturer.name,
      system: product.vehicleSystem.name,
      systemSlug: product.vehicleSystem.slug,
      stockDays: product.stockDays,
      price: pricing?.finalPrice ?? product.basePrice,
      appliedRule: pricing?.appliedRule ?? null,
      supplier: product.supplier
        ? {
            slug: product.supplier.slug,
            name: product.supplier.name,
            rating: product.supplier.rating,
          }
        : null,
      interchanges: product.interchanges.map((i) => ({
        id: i.id,
        partNumber: i.targetPartNo,
        manufacturer: i.targetManufacturer,
        exactMatch: i.exactMatch,
        isOEM: i.isOEM,
      })),
    },
  });
}
