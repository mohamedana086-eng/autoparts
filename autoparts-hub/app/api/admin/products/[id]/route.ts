import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-guard';
import { readProductInput, serialiseProduct } from '@/lib/admin-products';

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

  const existing = await prisma.product.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: 'Product not found.' }, { status: 404 });

  const [manufacturer, system, clash] = await Promise.all([
    prisma.manufacturer.findUnique({ where: { id: parsed.value.manufacturerId } }),
    prisma.vehicleSystem.findUnique({ where: { id: parsed.value.vehicleSystemId } }),
    prisma.product.findUnique({ where: { partNumber: parsed.value.partNumber } }),
  ]);

  if (!manufacturer) return NextResponse.json({ error: 'Unknown manufacturer.' }, { status: 400 });
  if (!system) return NextResponse.json({ error: 'Unknown vehicle system.' }, { status: 400 });
  if (clash && clash.id !== params.id) {
    return NextResponse.json(
      { error: `Part number ${parsed.value.partNumber} belongs to another product.` },
      { status: 409 }
    );
  }

  const product = await prisma.product.update({
    where: { id: params.id },
    data: parsed.value,
    include: {
      manufacturer: true,
      vehicleSystem: true,
      _count: { select: { interchanges: true } },
    },
  });

  return NextResponse.json({ product: serialiseProduct(product) });
}

// DELETE /api/admin/products/<id>
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const product = await prisma.product.findUnique({
    where: { id: params.id },
    include: { _count: { select: { orderItems: true, interchanges: true } } },
  });

  if (!product) return NextResponse.json({ error: 'Product not found.' }, { status: 404 });

  // OrderItem references the product, so removing one that has been ordered
  // would fail at the database and would rewrite order history besides.
  if (product._count.orderItems > 0) {
    return NextResponse.json(
      {
        error: `${product.partNumber} appears on ${product._count.orderItems} order line${
          product._count.orderItems === 1 ? '' : 's'
        } and cannot be deleted.`,
      },
      { status: 409 }
    );
  }

  // Cross-references belong to the product, so they go with it.
  await prisma.$transaction([
    prisma.interchange.deleteMany({ where: { sourceId: params.id } }),
    prisma.product.delete({ where: { id: params.id } }),
  ]);

  return NextResponse.json({ ok: true, removedInterchanges: product._count.interchanges });
}
