import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-guard';
import { readOutletInput } from '@/lib/admin-inventory';
import {
  deleteOutlet, outletById, outletIdByCode, updateOutlet, warehouseExists,
} from '@/lib/sites';

// PATCH /api/admin/outlets/<id>
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  const existing = await outletById(params.id);
  if (!existing) return NextResponse.json({ error: 'Outlet not found.' }, { status: 404 });

  const input = readOutletInput(body);
  if (!input.ok) return NextResponse.json({ error: input.error }, { status: 400 });

  const [clash, warehouseKnown] = await Promise.all([
    outletIdByCode(input.value.code),
    input.value.warehouseId ? warehouseExists(input.value.warehouseId) : Promise.resolve(true),
  ]);

  if (clash && clash !== params.id) {
    return NextResponse.json(
      { error: `${input.value.code} is already an outlet code.` },
      { status: 409 }
    );
  }
  if (!warehouseKnown) {
    return NextResponse.json({ error: 'Unknown warehouse.' }, { status: 400 });
  }

  await updateOutlet(params.id, input.value);

  return NextResponse.json({ outlet: await outletById(params.id) });
}

// DELETE /api/admin/outlets/<id>
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const outlet = await outletById(params.id);
  if (!outlet) return NextResponse.json({ error: 'Outlet not found.' }, { status: 404 });

  // Nothing references an outlet yet, so there is nothing to refuse for. When
  // orders learn to be collected from one, this needs the same guard the
  // product delete has.
  await deleteOutlet(params.id);

  return NextResponse.json({ ok: true });
}
