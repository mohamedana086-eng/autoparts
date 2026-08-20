import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-guard';
import { readImageRows } from '@/lib/admin-products';
import { adminProductById, productImages, replaceProductImages } from '@/lib/admin-catalogue';

// GET /api/admin/products/<id>/images
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const product = await adminProductById(params.id);
  if (!product) return NextResponse.json({ error: 'Product not found.' }, { status: 404 });

  return NextResponse.json({ images: await productImages(params.id) });
}

/**
 * PUT /api/admin/products/<id>/images — replaces the whole list, in order.
 *
 * A replace rather than add/remove/reorder endpoints: position is what decides
 * which picture leads, so every edit is a rewrite of the order anyway. Doing
 * it in one transaction also means a failed save leaves the old list intact
 * instead of a half-reordered one.
 */
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  const product = await adminProductById(params.id);
  if (!product) return NextResponse.json({ error: 'Product not found.' }, { status: 404 });

  const parsed = readImageRows(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  return NextResponse.json({ images: await replaceProductImages(params.id, parsed.value) });
}
