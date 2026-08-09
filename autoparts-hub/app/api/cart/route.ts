import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';

/**
 * The signed-in account's saved basket.
 *
 * No prices, in or out. What a line costs is resolved at checkout from the
 * catalogue and the caller's tier — see the order endpoint — and storing a
 * price here would be a second answer that goes stale and could be submitted
 * in place of the real one.
 *
 * The Angular cart still lives in localStorage. This is the copy that survives
 * a new device, and the one the admin's open-baskets list reads.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const cart = await prisma.cart.findUnique({
    where: { clientId: session.userId },
    include: {
      items: {
        include: { product: { select: { partNumber: true, name: true } } },
        orderBy: { addedAt: 'asc' },
      },
    },
  });

  return NextResponse.json({
    updatedAt: cart?.updatedAt.toISOString() ?? null,
    items: (cart?.items ?? []).map((i) => ({
      productId: i.productId,
      partNumber: i.product.partNumber,
      name: i.product.name,
      quantity: i.quantity,
    })),
  });
}

/**
 * PUT /api/cart — replaces the basket with what was sent.
 *
 * A replace rather than add/remove endpoints, because the client already holds
 * the whole basket in localStorage and is the thing deciding what is in it.
 * Sending the current state avoids the two copies drifting apart, which is
 * what per-item calls would have to reconcile.
 */
export async function PUT(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  const raw = body.items;
  if (!Array.isArray(raw)) return NextResponse.json({ error: 'Expected a list of items.' }, { status: 400 });
  if (raw.length > 200) {
    return NextResponse.json({ error: 'That is more lines than a basket can hold.' }, { status: 400 });
  }

  const wanted = new Map<string, number>();
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') {
      return NextResponse.json({ error: 'Every item must be an object.' }, { status: 400 });
    }
    const row = entry as Record<string, unknown>;
    const productId = String(row.productId ?? '').trim();
    const quantity = Number(row.quantity ?? 0);

    if (!productId) return NextResponse.json({ error: 'Every item needs a product.' }, { status: 400 });
    if (!Number.isInteger(quantity) || quantity < 1) {
      return NextResponse.json({ error: 'Quantity must be a whole number of one or more.' }, { status: 400 });
    }
    // The same part twice is one line with the quantities added, which is what
    // the unique key on (cart, product) means.
    wanted.set(productId, (wanted.get(productId) ?? 0) + quantity);
  }

  const ids = [...wanted.keys()];
  const known = await prisma.product.findMany({ where: { id: { in: ids } }, select: { id: true } });
  if (known.length !== ids.length) {
    // A part deleted from the catalogue since it was added. Naming it would
    // mean loading rows the caller may not have asked about; the client
    // reloads the basket on this and shows what survived.
    return NextResponse.json({ error: 'A part in that basket is no longer in the catalogue.' }, { status: 409 });
  }

  const cart = await prisma.$transaction(async (tx) => {
    const existing = await tx.cart.upsert({
      where: { clientId: session.userId },
      create: { clientId: session.userId },
      update: {},
    });

    await tx.cartItem.deleteMany({
      where: { cartId: existing.id, productId: { notIn: ids.length > 0 ? ids : ['—none—'] } },
    });

    for (const [productId, quantity] of wanted) {
      await tx.cartItem.upsert({
        where: { cartId_productId: { cartId: existing.id, productId } },
        create: { cartId: existing.id, productId, quantity },
        update: { quantity },
      });
    }

    // Touched explicitly: @updatedAt only fires on a write to Cart itself, and
    // every change above was to its items. The admin's open-baskets list is
    // ordered by this, so a basket edited today must not read as untouched.
    return tx.cart.update({
      where: { id: existing.id },
      data: { updatedAt: new Date() },
      include: {
        items: {
          include: { product: { select: { partNumber: true, name: true } } },
          orderBy: { addedAt: 'asc' },
        },
      },
    });
  });

  return NextResponse.json({
    updatedAt: cart.updatedAt.toISOString(),
    items: cart.items.map((i) => ({
      productId: i.productId,
      partNumber: i.product.partNumber,
      name: i.product.name,
      quantity: i.quantity,
    })),
  });
}
