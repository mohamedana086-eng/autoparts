import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-guard';
import { readWarehouseInput, serialiseWarehouse } from '@/lib/admin-inventory';

const WITH_HOLDINGS = {
  stock: { select: { quantity: true, reserved: true } },
  _count: { select: { outlets: true, stock: true } },
} as const;

// PATCH /api/admin/warehouses/<id>
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  const existing = await prisma.warehouse.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: 'Warehouse not found.' }, { status: 404 });

  const input = readWarehouseInput(body);
  if (!input.ok) return NextResponse.json({ error: input.error }, { status: 400 });

  const clash = await prisma.warehouse.findFirst({
    where: { id: { not: params.id }, code: input.value.code },
  });
  if (clash) {
    return NextResponse.json(
      { error: `${input.value.code} is already a warehouse code.` },
      { status: 409 }
    );
  }

  const warehouse = await prisma.warehouse.update({
    where: { id: params.id },
    data: input.value,
    include: WITH_HOLDINGS,
  });

  return NextResponse.json({ warehouse: serialiseWarehouse(warehouse) });
}

// DELETE /api/admin/warehouses/<id>
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const warehouse = await prisma.warehouse.findUnique({
    where: { id: params.id },
    include: WITH_HOLDINGS,
  });

  if (!warehouse) return NextResponse.json({ error: 'Warehouse not found.' }, { status: 404 });

  // The stock rows would cascade away with it, taking the count of every part
  // held here with them. Deactivating keeps the numbers and stops the picking,
  // which is what closing a site actually means.
  const units = warehouse.stock.reduce((sum, s) => sum + s.quantity, 0);
  if (units > 0) {
    return NextResponse.json(
      {
        error: `${warehouse.code} still holds ${units} unit${units === 1 ? '' : 's'}. ` +
          'Move the stock out, or set the warehouse inactive instead.',
      },
      { status: 409 }
    );
  }

  // Outlets survive on their own — the foreign key sets their warehouse to
  // null rather than deleting the shop counter. Say so rather than letting the
  // admin discover it.
  await prisma.warehouse.delete({ where: { id: params.id } });

  return NextResponse.json({ ok: true, orphanedOutlets: warehouse._count.outlets });
}
