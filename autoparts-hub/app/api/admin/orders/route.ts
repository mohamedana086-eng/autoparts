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
    include: {
      client: true,
      // The parts themselves, not just a count of them. A unit total answers
      // "how much" and nothing else — four of one part and one each of four
      // read identically — so the lines come down with the list rather than
      // behind a second request per order the table would have to fire while
      // being scrolled.
      items: {
        include: {
          product: {
            select: {
              partNumber: true,
              name: true,
              vehicleSystem: { select: { name: true } },
              manufacturer: { select: { name: true } },
            },
          },
        },
      },
    },
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
      /** Distinct parts, which is the number `units` alone cannot imply. */
      lineCount: o.items.length,
      // Prices here are the base-currency figures actually stored on the line,
      // matching `total` rather than `quotedTotal`, so a reader adding the
      // lines up arrives at the column beside them.
      lines: o.items.map((i) => ({
        productId: i.productId,
        partNumber: i.product.partNumber,
        name: i.product.name,
        manufacturer: i.product.manufacturer.name,
        system: i.product.vehicleSystem.name,
        quantity: i.quantity,
        unitPrice: roundMoney(i.unitPrice),
        lineTotal: roundMoney(i.unitPrice * i.quantity),
      })),
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
