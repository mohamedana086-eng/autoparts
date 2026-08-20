import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-guard';
import { categoryNameById, categoryReferences, deleteCategory } from '@/lib/pricing-admin';

// DELETE /api/admin/client-categories/<id>
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const name = await categoryNameById(params.id);
  if (name === null) return NextResponse.json({ error: 'Category not found.' }, { status: 404 });

  // Client.categoryId and MarkupRule.clientCategoryId both reference this row,
  // so deleting it out from under them fails at the database. Say why instead
  // of surfacing a foreign-key error.
  const refs = await categoryReferences(params.id);

  if (refs.clients > 0) {
    return NextResponse.json(
      {
        error: `${name} still has ${refs.clients} client${
          refs.clients === 1 ? '' : 's'
        }. Move them to another tier first.`,
      },
      { status: 409 }
    );
  }
  if (refs.markupRules > 0) {
    return NextResponse.json(
      {
        error: `${name} is used by ${refs.markupRules} markup rule${
          refs.markupRules === 1 ? '' : 's'
        }. Delete or retarget those first.`,
      },
      { status: 409 }
    );
  }

  await deleteCategory(params.id);
  return NextResponse.json({ ok: true });
}
