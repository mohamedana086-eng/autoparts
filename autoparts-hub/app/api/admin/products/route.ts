import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-guard';
import { readProductInput, serialiseProduct } from '@/lib/admin-products';

// GET /api/admin/products?q= — catalogue rows plus what the editor's selects need.
export async function GET(req: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const q = new URL(req.url).searchParams.get('q')?.trim() ?? '';

  // Brand is included deliberately: an admin looking for "brembo" means the
  // brand, and leaving it out made the filter answer nothing for it while the
  // storefront found the parts.
  const where = q
    ? {
        OR: [
          { partNumber: { contains: q, mode: 'insensitive' as const } },
          { name: { contains: q, mode: 'insensitive' as const } },
          { manufacturer: { name: { contains: q, mode: 'insensitive' as const } } },
          { vehicleSystem: { name: { contains: q, mode: 'insensitive' as const } } },
        ],
      }
    : {};

  const [products, manufacturers, systems, suppliers] = await Promise.all([
    prisma.product.findMany({
      where,
      include: {
        manufacturer: true,
        vehicleSystem: true,
        supplier: true,
        // Just the leading picture: the list shows one thumbnail, and pulling
        // every image for 300 rows to display one of each is wasted work.
        images: { orderBy: { sortOrder: 'asc' }, take: 1, select: { url: true } },
        stock: { select: { quantity: true, reserved: true } },
        _count: { select: { interchanges: true, images: true } },
      },
      orderBy: [{ vehicleSystem: { order: 'asc' } }, { partNumber: 'asc' }],
      take: 300,
    }),
    prisma.manufacturer.findMany({ orderBy: { name: 'asc' } }),
    prisma.vehicleSystem.findMany({ orderBy: { order: 'asc' } }),
    prisma.supplier.findMany({ orderBy: { name: 'asc' } }),
  ]);

  // The stock editor needs somewhere to put a count even when no part is held
  // anywhere yet, so the warehouse list travels with the catalogue rather than
  // being fetched again the first time a row is expanded.
  const warehouses = await prisma.warehouse.findMany({
    where: { active: true },
    orderBy: [{ priority: 'desc' }, { code: 'asc' }],
  });

  return NextResponse.json({
    products: products.map(serialiseProduct),
    manufacturers: manufacturers.map((m) => ({ id: m.id, name: m.name })),
    systems: systems.map((s) => ({ id: s.id, name: s.name })),
    suppliers: suppliers.map((s) => ({ id: s.id, name: s.name })),
    warehouses: warehouses.map((w) => ({ id: w.id, name: `${w.code} — ${w.name}` })),
  });
}

// POST /api/admin/products
export async function POST(req: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  const parsed = readProductInput(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const [manufacturer, system, clash, supplier] = await Promise.all([
    prisma.manufacturer.findUnique({ where: { id: parsed.value.manufacturerId } }),
    prisma.vehicleSystem.findUnique({ where: { id: parsed.value.vehicleSystemId } }),
    prisma.product.findUnique({ where: { partNumber: parsed.value.partNumber } }),
    parsed.value.supplierId
      ? prisma.supplier.findUnique({ where: { id: parsed.value.supplierId } })
      : Promise.resolve(null),
  ]);

  if (!manufacturer) return NextResponse.json({ error: 'Unknown manufacturer.' }, { status: 400 });
  if (!system) return NextResponse.json({ error: 'Unknown vehicle system.' }, { status: 400 });
  if (parsed.value.supplierId && !supplier) {
    return NextResponse.json({ error: 'Unknown supplier.' }, { status: 400 });
  }
  if (clash) {
    return NextResponse.json(
      { error: `Part number ${parsed.value.partNumber} is already in the catalogue.` },
      { status: 409 }
    );
  }

  // A blank lead time inherits the supplier's default, then the schema's.
  // This is the only place the supplier default is consulted: once a part
  // carries a number it is the part's own, and a later change to the
  // supplier's default must not silently rewrite it.
  const stockDays = parsed.value.stockDays ?? supplier?.defaultStockDays ?? 1;

  const product = await prisma.product.create({
    data: { ...parsed.value, stockDays },
    include: {
      manufacturer: true,
      vehicleSystem: true,
      supplier: true,
      // Empty on something just created, but included so a created row and a
      // listed one are the same shape and the table needs no special case.
      images: { orderBy: { sortOrder: 'asc' }, take: 1, select: { url: true } },
      stock: { select: { quantity: true, reserved: true } },
      _count: { select: { interchanges: true, images: true } },
    },
  });

  return NextResponse.json({ product: serialiseProduct(product) }, { status: 201 });
}
