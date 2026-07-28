import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-guard';

// DELETE /api/admin/client-categories/<id>
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const category = await prisma.clientCategory.findUnique({
    where: { id: params.id },
    include: { _count: { select: { clients: true, markupRules: true } } },
  });

  if (!category) return NextResponse.json({ error: 'Category not found.' }, { status: 404 });

  // Client.categoryId and MarkupRule.clientCategoryId both reference this row,
  // so deleting it out from under them fails at the database. Say why instead
  // of surfacing a foreign-key error.
  if (category._count.clients > 0) {
    return NextResponse.json(
      {
        error: `${category.name} still has ${category._count.clients} client${
          category._count.clients === 1 ? '' : 's'
        }. Move them to another tier first.`,
      },
      { status: 409 }
    );
  }
  if (category._count.markupRules > 0) {
    return NextResponse.json(
      {
        error: `${category.name} is used by ${category._count.markupRules} markup rule${
          category._count.markupRules === 1 ? '' : 's'
        }. Delete or retarget those first.`,
      },
      { status: 409 }
    );
  }

  await prisma.clientCategory.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
