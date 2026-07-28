import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET /api/systems — vehicle system tree for the storefront's browse grid.
export async function GET() {
  const systems = await prisma.vehicleSystem.findMany({ orderBy: { order: 'asc' } });

  return NextResponse.json({
    systems: systems.map((s) => ({ id: s.id, name: s.name, slug: s.slug, icon: s.icon })),
  });
}
