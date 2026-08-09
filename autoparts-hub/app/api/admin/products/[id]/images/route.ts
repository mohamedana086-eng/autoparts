import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-guard';
import { readImageRows, serialiseImage } from '@/lib/admin-products';

// GET /api/admin/products/<id>/images
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const product = await prisma.product.findUnique({
    where: { id: params.id },
    select: { id: true, images: { orderBy: { sortOrder: 'asc' } } },
  });

  if (!product) return NextResponse.json({ error: 'Product not found.' }, { status: 404 });

  return NextResponse.json({ images: product.images.map(serialiseImage) });
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

  const product = await prisma.product.findUnique({ where: { id: params.id } });
  if (!product) return NextResponse.json({ error: 'Product not found.' }, { status: 404 });

  const parsed = readImageRows(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  // Ids are not carried over: an image row holds nothing but a url, an alt and
  // a position, so re-creating the list loses nothing and keeps the write to
  // two statements instead of a diff nobody can read.
  const images = await prisma.$transaction(async (tx) => {
    await tx.productImage.deleteMany({ where: { productId: params.id } });
    if (parsed.value.length > 0) {
      await tx.productImage.createMany({
        data: parsed.value.map((image, index) => ({
          productId: params.id,
          url: image.url,
          alt: image.alt,
          sortOrder: index,
        })),
      });
    }
    return tx.productImage.findMany({
      where: { productId: params.id },
      orderBy: { sortOrder: 'asc' },
    });
  });

  return NextResponse.json({ images: images.map(serialiseImage) });
}
