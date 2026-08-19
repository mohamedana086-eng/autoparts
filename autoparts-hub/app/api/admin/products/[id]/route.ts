import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-guard';
import { readProductInput } from '@/lib/admin-products';
import {
  adminProductById, checkProductReferences, deleteProduct, productIdByPartNumber, updateProduct,
} from '@/lib/admin-catalogue';

// PATCH /api/admin/products/<id>
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  const parsed = readProductInput(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const existing = await adminProductById(params.id);
  if (!existing) return NextResponse.json({ error: 'Product not found.' }, { status: 404 });

  const [refs, clash] = await Promise.all([
    checkProductReferences(parsed.value),
    productIdByPartNumber(parsed.value.partNumber),
  ]);

  if (!refs.manufacturer) return NextResponse.json({ error: 'Unknown manufacturer.' }, { status: 400 });
  if (!refs.system) return NextResponse.json({ error: 'Unknown vehicle system.' }, { status: 400 });
  if (!refs.supplier) return NextResponse.json({ error: 'Unknown supplier.' }, { status: 400 });
  if (clash && clash !== params.id) {
    return NextResponse.json(
      { error: `Part number ${parsed.value.partNumber} belongs to another product.` },
      { status: 409 }
    );
  }

  // On an edit a blank lead time keeps what the part already had, rather than
  // reaching for the supplier's default: the number on an existing part was
  // put there deliberately, and clearing a field is not a request to change it.
  await updateProduct(params.id, {
    ...parsed.value,
    stockDays: parsed.value.stockDays ?? existing.stockDays,
  });

  return NextResponse.json({ product: await adminProductById(params.id) });
}

// DELETE /api/admin/products/<id>
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const product = await adminProductById(params.id);
  if (!product) return NextResponse.json({ error: 'Product not found.' }, { status: 404 });

  // OrderItem references the product, so removing one that has been ordered
  // would fail at the database and would rewrite order history besides.
  const result = await deleteProduct(params.id);

  if (!result.ok) {
    return NextResponse.json(
      {
        error: `${product.partNumber} appears on ${result.orderCount} order line${
          result.orderCount === 1 ? '' : 's'
        } and cannot be deleted.`,
      },
      { status: 409 }
    );
  }

  return NextResponse.json({ ok: true });
}
