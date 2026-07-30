import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { loadPricingContext, priceFor, roundMoney } from '@/lib/catalog';

const MAX_LINES = 200;
const MAX_QTY = 999;

/** APH-260729-K3F9 — short enough to read out over the phone. */
function makeReference(): string {
  const now = new Date();
  const date =
    String(now.getUTCFullYear()).slice(2) +
    String(now.getUTCMonth() + 1).padStart(2, '0') +
    String(now.getUTCDate()).padStart(2, '0');
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `APH-${date}-${suffix}`;
}

// GET /api/orders — the signed-in client's own orders.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const orders = await prisma.order.findMany({
    where: { clientId: session.userId },
    include: { items: { include: { product: true } } },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({
    orders: orders.map((o) => ({
      id: o.id,
      reference: o.reference,
      status: o.status,
      createdAt: o.createdAt.toISOString(),
      units: o.items.reduce((n, i) => n + i.quantity, 0),
      total: roundMoney(o.items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0)),
      lines: o.items.map((i) => ({
        partNumber: i.product.partNumber,
        name: i.product.name,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
      })),
    })),
  });
}

// POST /api/orders { items: [{ productId, quantity }] }
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to place an order.' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: 'Your cart is empty.' }, { status: 400 });
  }
  if (body.items.length > MAX_LINES) {
    return NextResponse.json({ error: `An order cannot exceed ${MAX_LINES} lines.` }, { status: 400 });
  }

  // Only ids and quantities are read off the request. Prices are never taken
  // from the client — they are resolved here from the catalogue and the
  // caller's own tier, so a tampered cart cannot set what it pays.
  const wanted = new Map<string, number>();
  for (const raw of body.items as Array<Record<string, unknown>>) {
    const productId = String(raw?.productId ?? '').trim();
    const quantity = Number(raw?.quantity ?? 0);

    if (!productId) return NextResponse.json({ error: 'A cart line is missing its product.' }, { status: 400 });
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QTY) {
      return NextResponse.json(
        { error: `Quantities must be whole numbers between 1 and ${MAX_QTY}.` },
        { status: 400 }
      );
    }
    wanted.set(productId, (wanted.get(productId) ?? 0) + quantity);
  }

  const products = await prisma.product.findMany({
    where: { id: { in: [...wanted.keys()] } },
    include: { manufacturer: true, vehicleSystem: true },
  });

  if (products.length !== wanted.size) {
    return NextResponse.json(
      { error: 'A part in your cart is no longer in the catalogue. Remove it and try again.' },
      { status: 409 }
    );
  }

  const ctx = await loadPricingContext();
  const lines = products.map((p) => ({
    productId: p.id,
    partNumber: p.partNumber,
    name: p.name,
    quantity: wanted.get(p.id)!,
    unitPrice: priceFor(p, ctx)?.finalPrice ?? p.basePrice,
  }));

  const total = roundMoney(lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0));

  // The tier's minimum order is a rule the schema already carries; enforce it
  // here rather than letting it sit unused.
  const category = session.categoryId
    ? await prisma.clientCategory.findUnique({ where: { id: session.categoryId } })
    : null;

  if (category && category.minOrderAmount > 0 && total < category.minOrderAmount) {
    return NextResponse.json(
      {
        error: `Orders on the ${category.name} tier start at €${category.minOrderAmount.toFixed(
          2
        )}. This one comes to €${total.toFixed(2)}.`,
      },
      { status: 409 }
    );
  }

  // reference is unique; a collision is unlikely but cheap to retry.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const order = await prisma.order.create({
        data: {
          reference: makeReference(),
          clientId: session.userId,
          items: {
            create: lines.map((l) => ({
              productId: l.productId,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
            })),
          },
        },
        include: { items: true },
      });

      return NextResponse.json(
        {
          order: {
            id: order.id,
            reference: order.reference,
            status: order.status,
            createdAt: order.createdAt.toISOString(),
            total,
            lines,
          },
        },
        { status: 201 }
      );
    } catch (e) {
      const clash =
        typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002';
      if (!clash || attempt === 4) throw e;
    }
  }

  return NextResponse.json({ error: 'Could not place that order.' }, { status: 500 });
}
