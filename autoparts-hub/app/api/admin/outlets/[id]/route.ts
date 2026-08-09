import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-guard';
import { readOutletInput, serialiseOutlet } from '@/lib/admin-inventory';

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

  const existing = await prisma.retailOutlet.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: 'Outlet not found.' }, { status: 404 });

  const input = readOutletInput(body);
  if (!input.ok) return NextResponse.json({ error: input.error }, { status: 400 });

  const [clash, warehouse] = await Promise.all([
    prisma.retailOutlet.findFirst({ where: { id: { not: params.id }, code: input.value.code } }),
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

  const outlet = await prisma.retailOutlet.update({
    where: { id: params.id },
    data: input.value,
    include: { warehouse: { select: { name: true, code: true } } },
  });

  return NextResponse.json({ outlet: serialiseOutlet(outlet) });
}

// DELETE /api/admin/outlets/<id>
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const outlet = await prisma.retailOutlet.findUnique({ where: { id: params.id } });
  if (!outlet) return NextResponse.json({ error: 'Outlet not found.' }, { status: 404 });

  // Nothing references an outlet yet, so there is nothing to refuse for. When
  // orders learn to be collected from one, this needs the same guard the
  // product delete has.
  await prisma.retailOutlet.delete({ where: { id: params.id } });

  return NextResponse.json({ ok: true });
}
