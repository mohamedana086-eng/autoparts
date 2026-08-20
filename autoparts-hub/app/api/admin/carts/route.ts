import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/admin-guard';
import { abandonedCarts } from '@/lib/admin-desk';

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
  const carts = await abandonedCarts(gate.isAdmin ? null : gate.session.userId);

  return NextResponse.json({
    carts: carts.map((cart) => ({
      id: cart.id,
      clientId: cart.clientId,
      clientName: cart.clientName,
      clientEmail: cart.clientEmail,
      updatedAt: cart.updatedAt.toISOString(),
      units: cart.units,
      cost: cart.cost,
      items: cart.items,
    })),
  });
}
