import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-guard';
import { readOutletInput } from '@/lib/admin-inventory';
import {
  adminOutlets, createOutlet, outletById, outletIdByCode, warehouseExists, warehouseOptions,
} from '@/lib/sites';

// GET /api/admin/outlets — the counters, plus the warehouses they can be served from.
export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  const [outlets, warehouses] = await Promise.all([adminOutlets(), warehouseOptions()]);

  return NextResponse.json({ outlets, warehouses });
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

  const [clash, warehouseKnown] = await Promise.all([
    outletIdByCode(input.value.code),
    input.value.warehouseId ? warehouseExists(input.value.warehouseId) : Promise.resolve(true),
  ]);

  if (clash) {
    return NextResponse.json(
      { error: `${input.value.code} is already an outlet code.` },
      { status: 409 }
    );
  }
  if (!warehouseKnown) {
    return NextResponse.json({ error: 'Unknown warehouse.' }, { status: 400 });
  }

  const id = await createOutlet(input.value);

  return NextResponse.json({ outlet: await outletById(id) }, { status: 201 });
}
