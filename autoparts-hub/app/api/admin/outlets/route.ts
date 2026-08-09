import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-guard';
import { readOutletInput, serialiseOutlet } from '@/lib/admin-inventory';

// GET /api/admin/outlets — the counters, plus the warehouses they can be served from.
export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  const [outlets, warehouses] = await Promise.all([
    prisma.retailOutlet.findMany({
      include: { warehouse: { select: { name: true, code: true } } },
      orderBy: [{ active: 'desc' }, { code: 'asc' }],
    }),
    prisma.warehouse.findMany({ orderBy: [{ priority: 'desc' }, { code: 'asc' }] }),
  ]);

  return NextResponse.json({
    outlets: outlets.map(serialiseOutlet),
    warehouses: warehouses.map((w) => ({ id: w.id, name: `${w.code} — ${w.name}` })),
  });
}

// POST /api/admin/outlets
export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  const input = readOutletInput(body);
  if (!input.ok) return NextResponse.json({ error: input.error }, { status: 400 });

  const [clash, warehouse] = await Promise.all([
    prisma.retailOutlet.findUnique({ where: { code: input.value.code } }),
    input.value.warehouseId
      ? prisma.warehouse.findUnique({ where: { id: input.value.warehouseId } })
      : Promise.resolve(null),
  ]);

  if (clash) {
    return NextResponse.json(
      { error: `${input.value.code} is already an outlet code.` },
      { status: 409 }
    );
  }
  if (input.value.warehouseId && !warehouse) {
    return NextResponse.json({ error: 'Unknown warehouse.' }, { status: 400 });
  }

  const outlet = await prisma.retailOutlet.create({
    data: input.value,
    include: { warehouse: { select: { name: true, code: true } } },
  });

  return NextResponse.json({ outlet: serialiseOutlet(outlet) }, { status: 201 });
}
