import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-guard';

/** How many lines to send back with one list. Enough to check a file landed
 *  the way it was meant to; not the whole thing, which can be tens of
 *  thousands of rows. */
const ITEM_PAGE = 200;

// GET /api/admin/price-lists/<id> — the list, with a sample of what is in it.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const list = await prisma.priceList.findUnique({
    where: { id: params.id },
    include: {
      _count: { select: { items: true } },
      items: {
        take: ITEM_PAGE,
        include: { product: { select: { partNumber: true, name: true, basePrice: true } } },
        orderBy: { product: { partNumber: 'asc' } },
      },
    },
  });

  if (!list) return NextResponse.json({ error: 'Price list not found.' }, { status: 404 });

  return NextResponse.json({
    list: {
      id: list.id,
      name: list.name,
      description: list.description,
      active: list.active,
      sourceName: list.sourceName,
      itemCount: list._count.items,
      createdAt: list.createdAt.toISOString(),
      updatedAt: list.updatedAt.toISOString(),
    },
    shown: list.items.length,
    items: list.items.map((i) => ({
      productId: i.productId,
      partNumber: i.product.partNumber,
      name: i.product.name,
      price: i.price,
      sourcePrice: i.sourcePrice,
      sourceCurrency: i.sourceCurrency,
      /** What the part costs without this list, so the change is visible. */
      basePrice: i.product.basePrice,
    })),
  });
}

/**
 * PATCH /api/admin/price-lists/<id> — rename it, or switch it on and off.
 *
 * Activating is the interesting half. At most one list may be active and the
 * database enforces that with a partial unique index, so the previous one has
 * to be stood down in the same transaction — otherwise the write fails, which
 * is the constraint doing its job but not an error anyone should have to see.
 * Switching a list on therefore switches the other off, which is exactly what
 * "activate this one instead" means.
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

  const existing = await prisma.priceList.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: 'Price list not found.' }, { status: 404 });

  const data: { name?: string; description?: string | null } = {};

  if (body.name !== undefined) {
    const name = String(body.name ?? '').trim();
    if (!name) return NextResponse.json({ error: 'Give the list a name.' }, { status: 400 });
    if (name.length > 120) {
      return NextResponse.json({ error: 'Keep the name under 120 characters.' }, { status: 400 });
    }
    data.name = name;
  }

  if (body.description !== undefined) {
    const description = String(body.description ?? '').trim();
    data.description = description || null;
  }

  const wantsActive = body.active === undefined ? null : body.active === true;

  const list = await prisma.$transaction(async (tx) => {
    if (wantsActive === true) {
      // Stand the current one down first, in the same transaction, so the two
      // lists are never both active — not even for the width of a statement.
      await tx.priceList.updateMany({
        where: { active: true, NOT: { id: params.id } },
        data: { active: false },
      });
    }

    return tx.priceList.update({
      where: { id: params.id },
      data: { ...data, ...(wantsActive === null ? {} : { active: wantsActive }) },
      include: { _count: { select: { items: true } } },
    });
  });

  return NextResponse.json({
    list: {
      id: list.id,
      name: list.name,
      description: list.description,
      active: list.active,
      sourceName: list.sourceName,
      itemCount: list._count.items,
      createdAt: list.createdAt.toISOString(),
      updatedAt: list.updatedAt.toISOString(),
    },
  });
}

/**
 * DELETE /api/admin/price-lists/<id>
 *
 * The active list cannot be deleted while it is active. Deleting it would
 * reprice the whole catalogue back to `basePrice` as a side effect of what
 * reads like housekeeping — so standing it down has to be its own deliberate
 * act first, and then the consequence is already on screen.
 */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const existing = await prisma.priceList.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: 'Price list not found.' }, { status: 404 });

  if (existing.active) {
    return NextResponse.json(
      {
        error:
          'That list is the one setting prices right now. Switch it off first — every part it covers goes back to its own price.',
      },
      { status: 409 }
    );
  }

  // Its lines go with it: the cascade is on the foreign key.
  await prisma.priceList.delete({ where: { id: params.id } });

  return NextResponse.json({ ok: true });
}
