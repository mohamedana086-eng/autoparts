import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/admin-guard';
import { roundMoney } from '@/lib/catalog';
import { adminOrders } from '@/lib/admin-desk';

// GET /api/admin/orders
export async function GET() {
  const gate = await requireStaff();
  if (!gate.ok) return gate.response;

  // Scoped through the customer's owner, so a salesperson sees the orders of
  // the accounts they look after and no others.
  const orders = await adminOrders(gate.isAdmin ? null : gate.session.userId);

  return NextResponse.json({
    orders: orders.map((o) => ({
      id: o.id,
      reference: o.reference,
      clientName: o.clientName,
      status: o.status,
      createdAt: o.createdAt.toISOString(),
      units: o.units,
      lineCount: o.lineCount,
      // Prices here are the base-currency figures actually stored on the line,
      // matching `total` rather than `quotedTotal`, so a reader adding the
      // lines up arrives at the column beside them.
      lines: o.lines.map((i) => ({
        productId: i.productId,
        partNumber: i.partNumber,
        name: i.name,
        manufacturer: i.manufacturer,
        system: i.system,
        quantity: i.quantity,
        unitPrice: roundMoney(i.unitPrice),
        lineTotal: roundMoney(i.unitPrice * i.quantity),
      })),
      // Base currency, deliberately: it is the only figure comparable across
      // customers quoted in different currencies, which is what a list of
      // every order is for. The quoted amount rides alongside for anyone
      // reconciling against what the customer actually saw.
      total: roundMoney(o.total),
      quotedTotal: roundMoney(o.total * o.currencyRate),
      currencyCode: o.currencyCode,
    })),
  });
}
