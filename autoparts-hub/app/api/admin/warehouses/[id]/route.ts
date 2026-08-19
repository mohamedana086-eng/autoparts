import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-guard';
import { readWarehouseInput } from '@/lib/admin-inventory';
import {
  allocationsAt, deleteWarehouse, updateWarehouse, warehouseById, warehouseIdByCode,
} from '@/lib/sites';

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

  const existing = await warehouseById(params.id);
  if (!existing) return NextResponse.json({ error: 'Warehouse not found.' }, { status: 404 });

  const input = readWarehouseInput(body);
  if (!input.ok) return NextResponse.json({ error: input.error }, { status: 400 });

  const clash = await warehouseIdByCode(input.value.code);
  if (clash && clash !== params.id) {
    return NextResponse.json(
      { error: `${input.value.code} is already a warehouse code.` },
      { status: 409 }
    );
  }

  await updateWarehouse(params.id, input.value);

  return NextResponse.json({ warehouse: await warehouseById(params.id) });
}

// DELETE /api/admin/warehouses/<id>
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const warehouse = await warehouseById(params.id);
  if (!warehouse) return NextResponse.json({ error: 'Warehouse not found.' }, { status: 404 });

  // The stock rows would cascade away with it, taking the count of every part
  // held here with them. Deactivating keeps the numbers and stops the picking,
  // which is what closing a site actually means.
  if (warehouse.totalQuantity > 0) {
    return NextResponse.json(
      {
        error: `${warehouse.code} still holds ${warehouse.totalQuantity} unit${
          warehouse.totalQuantity === 1 ? '' : 's'
        }. Move the stock out, or set the warehouse inactive instead.`,
      },
      { status: 409 }
    );
  }

  // Allocations are ON DELETE RESTRICT, and one outlives the shipment that
  // consumed it — so a warehouse can be empty and still be named by order
  // lines. Without this the delete reaches the database and fails there, which
  // is a 500 telling the admin nothing.
  const held = await allocationsAt(params.id);
  if (held > 0) {
    return NextResponse.json(
      {
        error: `${warehouse.code} is named by ${held} order line${held === 1 ? '' : 's'} and ` +
          'cannot be deleted. Set it inactive instead.',
      },
      { status: 409 }
    );
  }

  // Outlets survive on their own — the foreign key sets their warehouse to
  // null rather than deleting the shop counter. Reported rather than left for
  // the admin to discover.
  await deleteWarehouse(params.id);

  return NextResponse.json({ ok: true, orphanedOutlets: warehouse.outletCount });
}
