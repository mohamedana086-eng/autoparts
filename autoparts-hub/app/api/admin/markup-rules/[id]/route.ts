import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-guard';

// PATCH /api/admin/markup-rules/<id> { active }
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  if (typeof body.active !== 'boolean') {
    return NextResponse.json({ error: 'active must be true or false.' }, { status: 400 });
  }

  const existing = await prisma.markupRule.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: 'Rule not found.' }, { status: 404 });

  const rule = await prisma.markupRule.update({
    where: { id: params.id },
    data: { active: body.active },
  });

  return NextResponse.json({ id: rule.id, active: rule.active });
}

// DELETE /api/admin/markup-rules/<id>
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const existing = await prisma.markupRule.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: 'Rule not found.' }, { status: 404 });

  await prisma.markupRule.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
