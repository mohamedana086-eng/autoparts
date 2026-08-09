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

  const [manufacturer, system, clash, supplier] = await Promise.all([
    prisma.manufacturer.findUnique({ where: { id: parsed.value.manufacturerId } }),
    prisma.vehicleSystem.findUnique({ where: { id: parsed.value.vehicleSystemId } }),
    prisma.product.findUnique({ where: { partNumber: parsed.value.partNumber } }),
    parsed.value.supplierId
      ? prisma.supplier.findUnique({ where: { id: parsed.value.supplierId } })
      : Promise.resolve(null),
  ]);

  if (!manufacturer) return NextResponse.json({ error: 'Unknown manufacturer.' }, { status: 400 });
  if (!system) return NextResponse.json({ error: 'Unknown vehicle system.' }, { status: 400 });
  if (parsed.value.supplierId && !supplier) {
    return NextResponse.json({ error: 'Unknown supplier.' }, { status: 400 });
  }
  if (clash && clash.id !== params.id) {
    return NextResponse.json(
      { error: `Part number ${parsed.value.partNumber} belongs to another product.` },
      { status: 409 }
    );
  }

  // On an edit a blank lead time keeps what the part already had, rather than
  // reaching for the supplier's default: the number on an existing part was
  // put there deliberately, and clearing a field is not a request to change it.
  const product = await prisma.product.update({
    where: { id: params.id },
    data: { ...parsed.value, stockDays: parsed.value.stockDays ?? existing.stockDays },
    include: {
      manufacturer: true,
      vehicleSystem: true,
      supplier: true,
      images: { orderBy: { sortOrder: 'asc' }, take: 1, select: { url: true } },
      stock: { select: { quantity: true, reserved: true } },
      _count: { select: { interchanges: true, images: true } },
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

  // Cross-references belong to the product, so they go with it. Pictures,
  // stock rows and basket lines are cleared by the database's own cascades —
  // see the foreign keys in the inventory migration.
  await prisma.$transaction([
    prisma.interchange.deleteMany({ where: { sourceId: params.id } }),
    prisma.product.delete({ where: { id: params.id } }),
  ]);

  return NextResponse.json({ ok: true, removedInterchanges: product._count.interchanges });
}
