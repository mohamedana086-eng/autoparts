import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-guard';
import { readWarehouseInput, serialiseWarehouse } from '@/lib/admin-inventory';

// GET /api/admin/warehouses — every warehouse, with what it holds.
export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  const warehouses = await prisma.warehouse.findMany({
    include: {
      stock: { select: { quantity: true, reserved: true } },
      _count: { select: { outlets: true, stock: true } },
    },
    // Picking order, then code. The list is read to answer "where would this
    // ship from", and that is the order the answer is decided in.
    orderBy: [{ priority: 'desc' }, { code: 'asc' }],
  });

  return NextResponse.json({ warehouses: warehouses.map(serialiseWarehouse) });
}

// POST /api/admin/warehouses
export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  const input = readWarehouseInput(body);
  if (!input.ok) return NextResponse.json({ error: input.error }, { status: 400 });

  const clash = await prisma.warehouse.findUnique({ where: { code: input.value.code } });
  if (clash) {
    return NextResponse.json(
      { error: `${input.value.code} is already a warehouse code.` },
      { status: 409 }
    );
  }

  const warehouse = await prisma.warehouse.create({
    data: input.value,
    include: {
      stock: { select: { quantity: true, reserved: true } },
      _count: { select: { outlets: true, stock: true } },
    },
  });

  return NextResponse.json({ warehouse: serialiseWarehouse(warehouse) }, { status: 201 });
}
