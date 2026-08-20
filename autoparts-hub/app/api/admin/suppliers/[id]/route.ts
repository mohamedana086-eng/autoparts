import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-guard';
import { readRating, readSupplierInput, readTriStateFlag } from '@/lib/admin-suppliers';
import {
  adminSupplierById, deleteSupplier, supplierClash, supplierReferences, updateSupplier,
  updateSupplierQuick,
} from '@/lib/suppliers';

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

  const existing = await adminSupplierById(params.id);
  if (!existing) return NextResponse.json({ error: 'Supplier not found.' }, { status: 404 });

  const keys = Object.keys(body);
  const quickOnly =
    keys.length > 0 && keys.every((k) => QUICK_FIELDS.includes(k as (typeof QUICK_FIELDS)[number]));

  if (quickOnly) {
    const fields: { rating?: number | null; acceptsReturns?: boolean | null } = {};

    if ('rating' in body) {
      const rating = readRating(body.rating);
      if (!rating.ok) return NextResponse.json({ error: rating.error }, { status: 400 });
      fields.rating = rating.value;
    }

    if ('acceptsReturns' in body) {
      const returns = readTriStateFlag(body.acceptsReturns, 'Returns');
      if (!returns.ok) return NextResponse.json({ error: returns.error }, { status: 400 });
      fields.acceptsReturns = returns.value;
    }

    await updateSupplierQuick(params.id, fields);
    return NextResponse.json({ supplier: await adminSupplierById(params.id) });
  }

  const input = readSupplierInput(body);
  if (!input.ok) return NextResponse.json({ error: input.error }, { status: 400 });

  const clash = await supplierClash(input.value.code, input.value.slug, params.id);
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

  await updateSupplier(params.id, input.value);

  return NextResponse.json({ supplier: await adminSupplierById(params.id) });
}

// DELETE /api/admin/suppliers/<id>
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const supplier = await adminSupplierById(params.id);
  if (!supplier) return NextResponse.json({ error: 'Supplier not found.' }, { status: 404 });

  // Product.supplierId and MarkupRule.supplierId both point here, and both are
  // ON DELETE SET NULL — so the database would allow this and quietly unsource
  // the parts and change what they cost. Nothing stops it but this check.
  const refs = await supplierReferences(params.id);

  if (refs.products > 0) {
    return NextResponse.json(
      {
        error: `${supplier.name} still sources ${refs.products} part${
          refs.products === 1 ? '' : 's'
        }. Move those to another supplier first.`,
      },
      { status: 409 }
    );
  }
  if (refs.markupRules > 0) {
    return NextResponse.json(
      {
        error: `${supplier.name} is used by ${refs.markupRules} markup rule${
          refs.markupRules === 1 ? '' : 's'
        }. Delete or retarget those first.`,
      },
      { status: 409 }
    );
  }

  await deleteSupplier(params.id);
  return NextResponse.json({ ok: true });
}
