import { NextResponse } from 'next/server';
import { loadPricingContext, priceForRow, rowPurchasePrice } from '@/lib/catalog';
import { productDetail } from '@/lib/products';

// GET /api/catalog/products/<id> — detail view, priced for the caller's tier.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const found = await productDetail(params.id);

  if (!found) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 });
  }

  const { product, images, interchanges } = found;
  const ctx = await loadPricingContext();
  const pricing = priceForRow(product, ctx);

  return NextResponse.json({
    tierName: ctx.tierName,
    isLoggedIn: ctx.isLoggedIn,
    product: {
      id: product.id,
      partNumber: product.partNumber,
      name: product.name,
      description: product.description,
      manufacturer: product.manufacturerName,
      system: product.systemName,
      systemSlug: product.systemSlug,
      stockDays: product.stockDays,
      price: pricing?.finalPrice ?? rowPurchasePrice(product),
      appliedRule: pricing?.appliedRule ?? null,
      // Empty where nobody has added any, which today is every part. The alt
      // falls back to the part's name where it is rendered, per the schema.
      images,
      available: product.available,
      supplier: product.supplierSlug
        ? {
            slug: product.supplierSlug,
            name: product.supplierName!,
            rating: product.supplierRating,
          }
        : null,
      interchanges: interchanges.map((i) => ({
        id: i.id,
        partNumber: i.targetPartNo,
        manufacturer: i.targetManufacturer,
        exactMatch: i.exactMatch,
        isOEM: i.isOEM,
      })),
    },
  });
}
