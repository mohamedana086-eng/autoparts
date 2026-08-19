import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-guard';
import { deleteMarkupRule, markupRuleExists, setMarkupRuleActive } from '@/lib/pricing-admin';

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

  if (!(await markupRuleExists(params.id))) {
    return NextResponse.json({ error: 'Rule not found.' }, { status: 404 });
  }

  await setMarkupRuleActive(params.id, body.active);

  return NextResponse.json({ id: params.id, active: body.active });
}

// DELETE /api/admin/markup-rules/<id>
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const denied = await requireAdmin();
  if (denied) return denied;

  if (!(await markupRuleExists(params.id))) {
    return NextResponse.json({ error: 'Rule not found.' }, { status: 404 });
  }

  await deleteMarkupRule(params.id);
  return NextResponse.json({ ok: true });
}
