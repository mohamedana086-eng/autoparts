import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireStaff } from '@/lib/admin-guard';

/**
 * GET /api/admin/stats — the figures on the admin dashboard.
 *
 * `requireStaff`, not `requireAdmin`: the dashboard is the first page the admin
 * panel opens on and the guard on the panel admits SALES, so an admin-only
 * endpoint here meant every salesperson's session began on an error. The fix is
 * the one the customer, order and basket lists already use — let staff in, and
 * narrow the query to their own accounts rather than filtering afterwards.
 *
 * `activeRules` is left out for SALES rather than scoped, because there is no
 * such thing as their share of the markup rules: pricing is admin-only, and a
 * number they can neither reach nor act on is furniture.
 */
export async function GET() {
  const gate = await requireStaff();
  if (!gate.ok) return gate.response;

  const ownCustomers = gate.isAdmin ? {} : { salesManagerId: gate.session.userId };
  const ownOrders = gate.isAdmin ? {} : { client: { salesManagerId: gate.session.userId } };

  const [products, clients, orders, activeRules] = await Promise.all([
    // Catalogue-wide for everyone: the storefront search is public, so the
    // size of the catalogue is not something staff are being shown early.
    prisma.product.count(),
    prisma.client.count({ where: ownCustomers }),
    prisma.order.count({ where: ownOrders }),
    gate.isAdmin ? prisma.markupRule.count({ where: { active: true } }) : Promise.resolve(null),
  ]);

  return NextResponse.json({
    /** What the figures cover, so the page can label them honestly. */
    scope: gate.isAdmin ? 'all' : 'own',
    products,
    clients,
    orders,
    activeRules,
  });
}
