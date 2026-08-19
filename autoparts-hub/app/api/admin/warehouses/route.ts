import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-guard';
import { readWarehouseInput } from '@/lib/admin-inventory';
import { adminWarehouses, createWarehouse, warehouseById, warehouseIdByCode } from '@/lib/sites';

// GET /api/admin/warehouses — every warehouse, with what it holds.
export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  return NextResponse.json({ warehouses: await adminWarehouses() });
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

  const clash = await warehouseIdByCode(input.value.code);
  if (clash) {
    return NextResponse.json(
      { error: `${input.value.code} is already a warehouse code.` },
      { status: 409 }
    );
  }

  const id = await createWarehouse(input.value);

  return NextResponse.json({ warehouse: await warehouseById(id) }, { status: 201 });
}
