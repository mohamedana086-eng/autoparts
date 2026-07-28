import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-guard';

const ROLES = ['ADMIN', 'B2B', 'RETAIL'];

// PATCH /api/admin/clients/<id> { role, categoryId }
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  const role = String(body.role ?? '');
  if (!ROLES.includes(role)) {
    return NextResponse.json({ error: 'Unknown role.' }, { status: 400 });
  }

  const categoryId = body.categoryId ? String(body.categoryId) : null;
  if (categoryId) {
    const exists = await prisma.clientCategory.findUnique({ where: { id: categoryId } });
    if (!exists) return NextResponse.json({ error: 'Unknown pricing tier.' }, { status: 400 });
  }

  const existing = await prisma.client.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: 'Client not found.' }, { status: 404 });

  const client = await prisma.client.update({
    where: { id: params.id },
    data: { role, categoryId },
    include: { category: true },
  });

  return NextResponse.json({
    client: {
      id: client.id,
      name: client.name,
      email: client.email,
      role: client.role,
      city: client.city,
      hasLogin: !!client.passwordHash,
      categoryId: client.categoryId,
      categoryName: client.category?.name ?? null,
    },
  });
}
