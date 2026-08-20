import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-guard';
import { readProductInput } from '@/lib/admin-products';
import {
  adminProductById, adminProducts, catalogueReferences, checkProductReferences,
  createProduct, productIdByPartNumber,
} from '@/lib/admin-catalogue';

// GET /api/admin/products?q= — catalogue rows plus what the editor's selects need.
export async function GET(req: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const q = new URL(req.url).searchParams.get('q')?.trim() ?? '';

  const [products, references] = await Promise.all([adminProducts(q), catalogueReferences()]);

  return NextResponse.json({ products, ...references });
}

// POST /api/admin/products
export async function POST(req: NextRequest) {
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

  const [refs, clash] = await Promise.all([
    checkProductReferences(parsed.value),
    productIdByPartNumber(parsed.value.partNumber),
  ]);

  if (!refs.manufacturer) return NextResponse.json({ error: 'Unknown manufacturer.' }, { status: 400 });
  if (!refs.system) return NextResponse.json({ error: 'Unknown vehicle system.' }, { status: 400 });
  if (!refs.supplier) return NextResponse.json({ error: 'Unknown supplier.' }, { status: 400 });
  if (clash) {
    return NextResponse.json(
      { error: `Part number ${parsed.value.partNumber} is already in the catalogue.` },
      { status: 409 }
    );
  }

  // A blank lead time inherits the supplier's default, then the schema's.
  // This is the only place the supplier default is consulted: once a part
  // carries a number it is the part's own, and a later change to the
  // supplier's default must not silently rewrite it.
  const stockDays = parsed.value.stockDays ?? refs.supplierStockDays ?? 1;

  const id = await createProduct({ ...parsed.value, stockDays });

  return NextResponse.json({ product: await adminProductById(id) }, { status: 201 });
}
