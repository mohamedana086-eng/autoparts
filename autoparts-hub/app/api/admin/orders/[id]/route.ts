import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-guard';
import { orderById, setOrderStatus } from '@/lib/orders';
import { isConstraintViolation, CHECK_VIOLATION } from '@/lib/sql';

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
const hasLeft = (status: string) => GONE.has(status);

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

  const existing = await orderById(params.id);
  if (!existing) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });

  try {
    const order = await setOrderStatus(params.id, existing.status, status, hasLeft);
    return NextResponse.json({ id: order.id, status: order.status });
  } catch (e) {
    // The CHECK on StockLevel refusing a negative count: the shelves and the
    // orders holding them disagree, so releasing this one would drive reserved
    // below zero. No amount of retrying fixes it and the admin cannot diagnose
    // it from a stack trace. `npm run db:reconcile` reports and repairs it.
    if (!isConstraintViolation(e, CHECK_VIOLATION)) throw e;

    return NextResponse.json(
      {
        error:
          'This order holds more stock than its warehouses have reserved, so it cannot be ' +
          'released. The status has not changed. Run the stock reconciliation to repair it.',
      },
      { status: 409 }
    );
  }
}
