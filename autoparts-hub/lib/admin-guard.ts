import 'server-only';
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

/**
 * Gate for every /api/admin route.
 *
 * The Next admin pages are protected by a redirect in their layout, which
 * does nothing for the API — without this, any signed-in customer (or an
 * anonymous caller) could read the client list or rewrite markup rules by
 * hitting the endpoints directly. Call this first in every admin handler.
 */
export async function requireAdmin(): Promise<NextResponse | null> {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }
  if (session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });
  }
  return null;
}
