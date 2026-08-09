import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET /api/suppliers/<slug> — the supplier's own page: who they are, and
// what they carry broken down by system and brand so the page can show the
// shape of their range without listing every part.
//
// The parts themselves come from /api/catalog/search?supplier=<slug>, which
// already handles pricing, filtering and sorting.
export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const supplier = await prisma.supplier.findUnique({
    where: { slug: params.slug },
    include: {
      products: {
        include: { manufacturer: true, vehicleSystem: true },
      },
    },
  });

  if (!supplier) {
    return NextResponse.json({ error: 'No such supplier.' }, { status: 404 });
  }

  const systems = new Map<string, { slug: string; name: string; count: number }>();
  const brands = new Map<string, number>();
  let fastest: number | null = null;

  for (const p of supplier.products) {
    const entry = systems.get(p.vehicleSystem.slug);
    if (entry) entry.count++;
    else systems.set(p.vehicleSystem.slug, {
      slug: p.vehicleSystem.slug,
      name: p.vehicleSystem.name,
      count: 1,
    });

    brands.set(p.manufacturer.name, (brands.get(p.manufacturer.name) ?? 0) + 1);
    if (fastest === null || p.stockDays < fastest) fastest = p.stockDays;
  }

  return NextResponse.json({
    supplier: {
      id: supplier.id,
      code: supplier.code,
      slug: supplier.slug,
      name: supplier.name,
      description: supplier.description,
      reliability: supplier.reliability,
      rating: supplier.rating,
      acceptsReturns: supplier.acceptsReturns,
      country: supplier.country,
      guaranteeMonths: supplier.guaranteeMonths,
      productCount: supplier.products.length,
      fastestDelivery: fastest,
      systems: [...systems.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
      brands: [...brands.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    },
  });
}
