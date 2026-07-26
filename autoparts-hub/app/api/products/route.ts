import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { resolvePrice, MarkupRule } from '@/lib/pricing';

// GET /api/products?q=<part number or name>&system=<slug>&clientId=<id>
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim() ?? '';
  const system = searchParams.get('system') ?? undefined;
  const clientId = searchParams.get('clientId') ?? undefined;

  const products = await prisma.product.findMany({
    where: {
      AND: [
        q ? { OR: [{ partNumber: { contains: q } }, { name: { contains: q } }] } : {},
        system ? { vehicleSystem: { slug: system } } : {},
      ],
    },
    include: { manufacturer: true, vehicleSystem: true },
    take: 30,
  });

  // Resolve pricing context: fall back to Retail category + a default
  // "IB16" supplier if the request has no client on file.
  const client = clientId
    ? await prisma.client.findUnique({ where: { id: clientId }, include: { category: true } })
    : await prisma.clientCategory.findFirst({ where: { name: 'Retail' } }).then((cat) => (cat ? { category: cat } : null));

  const category = client?.category;
  const rules = (await prisma.markupRule.findMany({ where: { active: true } })) as unknown as MarkupRule[];
  const defaultSupplierId = (await prisma.supplier.findFirst())?.id ?? '';

  const priced = products.map((p) => {
    const result = category
      ? resolvePrice(
          {
            basePrice: p.basePrice,
            supplierId: defaultSupplierId,
            manufacturerName: p.manufacturer.name,
            vehicleSystemSlug: p.vehicleSystem.slug,
            partNumber: p.partNumber,
            clientCategoryId: category.id,
            clientCategoryMarkupPercent: category.markupPercent,
          },
          rules
        )
      : { basePrice: p.basePrice, finalPrice: p.basePrice, appliedRule: 'No pricing tier', marginPercent: 0 };

    return {
      id: p.id,
      partNumber: p.partNumber,
      name: p.name,
      manufacturer: p.manufacturer.name,
      system: p.vehicleSystem.name,
      stockDays: p.stockDays,
      pricing: result,
    };
  });

  return NextResponse.json({ count: priced.length, products: priced });
}
