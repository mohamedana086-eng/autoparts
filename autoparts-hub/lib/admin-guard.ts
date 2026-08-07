import 'server-only';
import { NextResponse } from 'next/server';
import { getSession, type SessionPayload } from '@/lib/auth';

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

export type StaffGate =
  | { ok: false; response: NextResponse }
  | { ok: true; session: SessionPayload; isAdmin: boolean };

/**
 * Gate for the handful of admin reads a SALES account may also make.
 *
 * Deliberately a second function rather than a relaxation of requireAdmin:
 * every route keeps whatever it already had, and letting SALES somewhere new
 * has to be a visible edit to that route. Opting in is the only way in.
 *
 * It returns the session because scoping is the caller's job — knowing the
 * request is from staff is not enough, the query has to be narrowed to that
 * salesperson's own customers. `isAdmin` is what says whether to narrow.
 */
export async function requireStaff(): Promise<StaffGate> {
  const session = await getSession();

  if (!session) {
    return { ok: false, response: NextResponse.json({ error: 'Not signed in.' }, { status: 401 }) };
  }
  if (session.role !== 'ADMIN' && session.role !== 'SALES') {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Admin access required.' }, { status: 403 }),
    };
  }

  return { ok: true, session, isAdmin: session.role === 'ADMIN' };
}
