import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET /api/vehicles — the whole make/model/variant tree for the picker.
// Small enough to send in one go; paginate here if the list ever grows.
export async function GET() {
  const makes = await prisma.vehicleMake.findMany({
    orderBy: { name: 'asc' },
    include: {
      models: {
        orderBy: { name: 'asc' },
        include: { variants: { orderBy: { name: 'asc' } } },
      },
    },
  });

  return NextResponse.json({
    makes: makes.map((make) => ({
      id: make.id,
      name: make.name,
      models: make.models.map((model) => ({
        id: model.id,
        name: model.name,
        yearFrom: model.yearFrom,
        yearTo: model.yearTo,
        variants: model.variants.map((v) => ({
          id: v.id,
          name: v.name,
          engineCode: v.engineCode,
          powerKw: v.powerKw,
          fuel: v.fuel,
          yearFrom: v.yearFrom,
          yearTo: v.yearTo,
        })),
      })),
    })),
  });
}
