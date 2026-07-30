import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET /api/suppliers — everyone we buy from, for the directory page.
export async function GET() {
  const suppliers = await prisma.supplier.findMany({
    include: { _count: { select: { products: true } } },
    orderBy: { name: 'asc' },
  });

  return NextResponse.json({
    suppliers: suppliers.map((s) => ({
      id: s.id,
      code: s.code,
      slug: s.slug,
      name: s.name,
      description: s.description,
      reliability: s.reliability,
      productCount: s._count.products,
    })),
  });
}
