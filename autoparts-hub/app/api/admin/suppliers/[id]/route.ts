import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-guard';
import {
  readRating,
  readSupplierInput,
  readTriStateFlag,
  serialiseSupplier,
} from '@/lib/admin-suppliers';

/** Fields the list view can set on their own, without a full edit. */
const QUICK_FIELDS = ['rating', 'acceptsReturns'] as const;

/**
 * PATCH /api/admin/suppliers/<id>
 *
 * Two shapes on purpose. A body carrying nothing but the quick fields sets
 * just those — which is what the star control and the returns toggle in the
 * list send, and it means classifying a supplier cannot accidentally rewrite
 * their code or the url their page lives at. Any other body is treated as a
 * full edit and validated as one.
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

  const keys = Object.keys(body);
  const quickOnly =
    keys.length > 0 && keys.every((k) => QUICK_FIELDS.includes(k as (typeof QUICK_FIELDS)[number]));

  if (quickOnly) {
    const data: { rating?: number | null; acceptsReturns?: boolean | null } = {};

    if ('rating' in body) {
      const rating = readRating(body.rating);
      if (!rating.ok) return NextResponse.json({ error: rating.error }, { status: 400 });
      data.rating = rating.value;
    }

    if ('acceptsReturns' in body) {
      const returns = readTriStateFlag(body.acceptsReturns, 'Returns');
      if (!returns.ok) return NextResponse.json({ error: returns.error }, { status: 400 });
      data.acceptsReturns = returns.value;
    }

    const supplier = await prisma.supplier.update({
      where: { id: params.id },
      data,
      include: { _count: { select: { products: true } }, purchaseCurrency: true },
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
    include: { _count: { select: { products: true } }, purchaseCurrency: true },
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
