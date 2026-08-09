import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireStaff } from '@/lib/admin-guard';

/**
 * GET /api/admin/carts — baskets that were filled and never ordered.
 *
 * The sales question this answers is "who nearly bought something", so it is
 * open to SALES as well as ADMIN, scoped the same way the customer list is.
 *
 * Line values are the catalogue's purchase prices summed, not what the
 * customer would pay: pricing a basket per account means running the markup
 * engine for every line of every basket, and this list exists to be skimmed.
 * The number is labelled as cost in the UI for that reason.
 */
export async function GET() {
  const gate = await requireStaff();
  if (!gate.ok) return gate.response;

  // Scoped in the query, not filtered afterwards — see the client list.
  const scope = gate.isAdmin
    ? {}
    : { client: { salesManagerId: gate.session.userId } };

  const carts = await prisma.cart.findMany({
    where: { ...scope, items: { some: {} } },
    include: {
      client: { select: { id: true, name: true, email: true } },
      items: {
        include: { product: { select: { partNumber: true, name: true, basePrice: true } } },
        orderBy: { addedAt: 'asc' },
      },
    },
    // Oldest first: a basket sitting untouched for a fortnight is the one
    // worth a phone call, and it is the one a newest-first list buries.
    orderBy: { updatedAt: 'asc' },
    take: 200,
  });

  return NextResponse.json({
    carts: carts.map((cart) => ({
      id: cart.id,
      clientId: cart.client.id,
      clientName: cart.client.name,
      clientEmail: cart.client.email,
      updatedAt: cart.updatedAt.toISOString(),
      units: cart.items.reduce((sum, i) => sum + i.quantity, 0),
      cost: cart.items.reduce((sum, i) => sum + i.quantity * i.product.basePrice, 0),
      items: cart.items.map((i) => ({
        productId: i.productId,
        partNumber: i.product.partNumber,
        name: i.product.name,
        quantity: i.quantity,
      })),
    })),
  });
}
