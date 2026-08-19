import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/admin-guard';
import { dashboardCounts } from '@/lib/admin-desk';

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

  const counts = await dashboardCounts(gate.isAdmin ? null : gate.session.userId);

  return NextResponse.json({
    /** What the figures cover, so the page can label them honestly. */
    scope: gate.isAdmin ? 'all' : 'own',
    ...counts,
  });
}
