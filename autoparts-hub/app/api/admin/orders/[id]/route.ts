import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-guard';

/** The statuses the schema documents on Order.status. Not exported: a route
 *  module may only export its handlers and Next's config names. */
const ORDER_STATUSES = ['order_is_sent', 'processing', 'shipped', 'paid'];

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

  const order = await prisma.order.update({
    where: { id: params.id },
    data: { status },
  });

  return NextResponse.json({ id: order.id, status: order.status });
}
