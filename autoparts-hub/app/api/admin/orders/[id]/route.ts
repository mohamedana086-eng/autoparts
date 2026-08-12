import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-guard';
import { applyShipmentChange } from '@/lib/inventory';

/** The statuses the schema documents on Order.status. Not exported: a route
 *  module may only export its handlers and Next's config names. */
const ORDER_STATUSES = ['order_is_sent', 'processing', 'shipped', 'paid'];

/**
 * Which statuses mean the goods have left the building.
 *
 * `paid` counts: an order is not marked paid before it is fulfilled, and
 * treating it as still-on-the-shelf would put the units back the moment the
 * invoice was settled. Kept as a set rather than a `=== 'shipped'` test so the
 * question has one answer both here and in a year.
 */
const GONE = new Set(['shipped', 'paid']);

// PATCH /api/admin/orders/<id> { status }
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  const status = String(body.status ?? '');
  if (!ORDER_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: `Status must be one of: ${ORDER_STATUSES.join(', ')}.` },
      { status: 400 }
    );
  }

  const existing = await prisma.order.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });

  // The status and the shelves it moves are written together: an order shown
  // as shipped whose stock was never drawn down is the discrepancy a warehouse
  // finds at the next count and cannot explain.
  const order = await prisma.$transaction(async (tx) => {
    const updated = await tx.order.update({
      where: { id: params.id },
      data: { status },
    });

    await applyShipmentChange(tx, params.id, GONE.has(existing.status), GONE.has(status));

    return updated;
  });

  return NextResponse.json({ id: order.id, status: order.status });
}
