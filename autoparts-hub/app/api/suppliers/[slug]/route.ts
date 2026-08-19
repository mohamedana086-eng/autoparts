import { NextResponse } from 'next/server';
import { supplierBySlug } from '@/lib/suppliers';

// GET /api/suppliers/<slug> — the supplier's own page: who they are, and
// what they carry broken down by system and brand so the page can show the
// shape of their range without listing every part.
//
// The parts themselves come from /api/catalog/search?supplier=<slug>, which
// already handles pricing, filtering and sorting.
export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const found = await supplierBySlug(params.slug);

  if (!found) {
    return NextResponse.json({ error: 'No such supplier.' }, { status: 404 });
  }

  return NextResponse.json({
    supplier: { ...found.supplier, systems: found.systems, brands: found.brands },
  });
}
