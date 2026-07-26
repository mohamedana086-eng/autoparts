import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { resolvePrice, MarkupRule } from '@/lib/pricing';

// GET /api/pricing?productId=<id>&clientId=<id>
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const productId = searchParams.get('productId');
  const clientId = searchParams.get('clientId');

  if (!productId) {
    return NextResponse.json({ error: 'productId is required' }, { status: 400 });
  }

  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { manufacturer: true, vehicleSystem: true },
  });
  if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 });

  const client = clientId
    ? await prisma.client.findUnique({ where: { id: clientId }, include: { category: true } })
    : null;
  const category = client?.category ?? (await prisma.clientCategory.findFirst({ where: { name: 'Retail' } }));
  if (!category) return NextResponse.json({ error: 'No pricing tier configured' }, { status: 500 });

  const rules = (await prisma.markupRule.findMany({ where: { active: true } })) as unknown as MarkupRule[];
  const defaultSupplierId = (await prisma.supplier.findFirst())?.id ?? '';

  const result = resolvePrice(
    {
      basePrice: product.basePrice,
      supplierId: defaultSupplierId,
      manufacturerName: product.manufacturer.name,
      vehicleSystemSlug: product.vehicleSystem.slug,
      partNumber: product.partNumber,
      clientCategoryId: category.id,
      clientCategoryMarkupPercent: category.markupPercent,
    },
    rules
  );

  return NextResponse.json({ product: product.partNumber, clientCategory: category.name, ...result });
}
