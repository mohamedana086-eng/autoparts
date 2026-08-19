import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/admin-guard';
import { adminClients, clientOptions } from '@/lib/admin-desk';

// GET /api/admin/clients — every account, plus the tiers they can be moved to.
export async function GET() {
  const gate = await requireStaff();
  if (!gate.ok) return gate.response;

  // A salesperson sees their own customers and nobody else's. Scoped in the
  // query rather than filtered after loading: a filter is one forgotten
  // `return` away from serving the whole client list.
  const scope = gate.isAdmin ? null : gate.session.userId;

  const [clients, options] = await Promise.all([adminClients(scope), clientOptions()]);

  return NextResponse.json({ clients, ...options });
}
