import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireStaff } from '@/lib/admin-guard';
import { roundMoney } from '@/lib/catalog';

// GET /api/admin/orders
export async function GET() {
  const gate = await requireStaff();
  if (!gate.ok) return gate.response;

  // Scoped through the customer's owner, so a salesperson sees the orders of
  // the accounts they look after and no others.
  const orders = await prisma.order.findMany({
    where: gate.isAdmin ? {} : { client: { salesManagerId: gate.session.userId } },
    include: { client: true, items: true },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({
    orders: orders.map((o) => ({
      id: o.id,
      reference: o.reference,
      clientName: o.client.name,
      status: o.status,
      createdAt: o.createdAt.toISOString(),
      units: o.items.reduce((n, i) => n + i.quantity, 0),
      // Base currency, deliberately: it is the only figure comparable across
      // customers quoted in different currencies, which is what a list of
      // every order is for. The quoted amount rides alongside for anyone
      // reconciling against what the customer actually saw.
      total: roundMoney(o.items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0)),
      quotedTotal: roundMoney(
        o.items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0) * o.currencyRate
      ),
      currencyCode: o.currencyCode,
    })),
  });
}
