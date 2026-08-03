import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-guard';
import { readRating, readSupplierInput, serialiseSupplier } from '@/lib/admin-suppliers';

/**
 * PATCH /api/admin/suppliers/<id>
 *
 * Two shapes on purpose. A body carrying only `rating` sets just that — which
 * is what the star control in the list sends, and it means rating a supplier
 * cannot accidentally rewrite their code or url. Any other body is treated as
 * a full edit and validated as one.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  const existing = await prisma.supplier.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: 'Supplier not found.' }, { status: 404 });

  const ratingOnly = Object.keys(body).length === 1 && 'rating' in body;

  if (ratingOnly) {
    const rating = readRating(body.rating);
    if (!rating.ok) return NextResponse.json({ error: rating.error }, { status: 400 });

    const supplier = await prisma.supplier.update({
      where: { id: params.id },
      data: { rating: rating.value },
      include: { _count: { select: { products: true } } },
    });
    return NextResponse.json({ supplier: serialiseSupplier(supplier) });
  }

  const input = readSupplierInput(body);
  if (!input.ok) return NextResponse.json({ error: input.error }, { status: 400 });

  const clash = await prisma.supplier.findFirst({
    where: {
      id: { not: params.id },
      OR: [{ code: input.value.code }, { slug: input.value.slug }],
    },
  });
  if (clash) {
    return NextResponse.json(
      {
        error:
          clash.code === input.value.code
            ? `Code ${input.value.code} is already used by ${clash.name}.`
            : `The url /supplier/${input.value.slug} is already used by ${clash.name}.`,
      },
      { status: 409 }
    );
  }

  const supplier = await prisma.supplier.update({
    where: { id: params.id },
    data: input.value,
    include: { _count: { select: { products: true } } },
  });

  return NextResponse.json({ supplier: serialiseSupplier(supplier) });
}

// DELETE /api/admin/suppliers/<id>
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const supplier = await prisma.supplier.findUnique({
    where: { id: params.id },
    include: { _count: { select: { products: true, markupRules: true } } },
  });

  if (!supplier) return NextResponse.json({ error: 'Supplier not found.' }, { status: 404 });

  // Product.supplierId and MarkupRule.supplierId both point here. Deleting
  // would either fail at the database or, worse, quietly unsource parts and
  // change what they cost — so say why instead.
  if (supplier._count.products > 0) {
    return NextResponse.json(
      {
        error: `${supplier.name} still sources ${supplier._count.products} part${
          supplier._count.products === 1 ? '' : 's'
        }. Move those to another supplier first.`,
      },
      { status: 409 }
    );
  }
  if (supplier._count.markupRules > 0) {
    return NextResponse.json(
      {
        error: `${supplier.name} is used by ${supplier._count.markupRules} markup rule${
          supplier._count.markupRules === 1 ? '' : 's'
        }. Delete or retarget those first.`,
      },
      { status: 409 }
    );
  }

  await prisma.supplier.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
