import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { loadPricingContext, priceForRow, rowPurchasePrice, roundMoney } from '@/lib/catalog';
import {
  OutOfStock, ordersForClient, placeOrder, priceableProducts, tierById,
} from '@/lib/orders';

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

  const orders = await ordersForClient(session.userId);

  // Line prices are stored in the base currency; the order carries the rate
  // that applied when it was placed. Converting on the way out shows the
  // customer the figures they agreed to, and keeps showing them after their
  // account is moved to another currency.
  return NextResponse.json({
    orders: orders.map((o) => ({
      id: o.id,
      reference: o.reference,
      status: o.status,
      createdAt: o.createdAt.toISOString(),
      units: o.lines.reduce((n, l) => n + l.quantity, 0),
      total: roundMoney(
        o.lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0) * o.currencyRate
      ),
      currencyCode: o.currencyCode,
      lines: o.lines.map((l) => ({
        partNumber: l.partNumber,
        name: l.name,
        quantity: l.quantity,
        unitPrice: roundMoney(l.unitPrice * o.currencyRate),
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

  const products = await priceableProducts([...wanted.keys()]);

  if (products.length !== wanted.size) {
    return NextResponse.json(
      { error: 'A part in your cart is no longer in the catalogue. Remove it and try again.' },
      { status: 409 }
    );
  }

  const ctx = await loadPricingContext();

  // Lines are stored in the base currency — see the migration. The rate is
  // recorded once on the order so the whole thing can be shown back in what
  // the customer was quoted, without the stored numbers moving if their
  // currency is changed later.
  const rate = ctx.currency?.rate ?? 1;
  const currencyCode = ctx.currency?.code ?? 'EUR';
  const symbol = ctx.currency?.symbol ?? '€';

  const lines = products.map((p) => ({
    productId: p.id,
    partNumber: p.partNumber,
    name: p.name,
    quantity: wanted.get(p.id)!,
    unitPrice: priceForRow(p, ctx)?.netBase ?? rowPurchasePrice(p),
  }));

  const total = roundMoney(lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0));

  // The tier's minimum order is a rule the schema already carries; enforce it
  // here rather than letting it sit unused.
  const tier = session.categoryId ? await tierById(session.categoryId) : null;

  // Compared in the base currency, where both figures are denominated. Doing
  // it after conversion would make the threshold trivial to clear on a weak
  // currency and impossible on a strong one, for the same basket.
  if (tier && tier.minOrderAmount > 0 && total < tier.minOrderAmount) {
    return NextResponse.json(
      {
        error: `Orders on the ${tier.name} tier start at ${symbol}${roundMoney(
          tier.minOrderAmount * rate
        ).toFixed(2)}. This one comes to ${symbol}${roundMoney(total * rate).toFixed(2)}.`,
      },
      { status: 409 }
    );
  }

  try {
    const order = await placeOrder({
      clientId: session.userId,
      currencyCode,
      currencyRate: rate,
      lines: lines.map((l) => ({
        productId: l.productId,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
      })),
      reference: makeReference,
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
    if (!(e instanceof OutOfStock)) throw e;

    const { productId, wanted: asked, available } = e.shortfall;
    const part = products.find((p) => p.id === productId);
    const label = part ? `${part.partNumber} (${part.name})` : 'A part in your cart';

    return NextResponse.json(
      {
        error:
          available === 0
            ? // Covers both an empty shelf and a part nobody has counted: to a
              // customer they are the same answer, and naming the bookkeeping
              // difference would explain nothing they can act on.
              `${label} is out of stock. Remove it and try again.`
            : `Only ${available} of ${label} ${available === 1 ? 'is' : 'are'} available, and you asked for ${asked}.`,
        productId,
        available,
      },
      { status: 409 }
    );
  }
}
