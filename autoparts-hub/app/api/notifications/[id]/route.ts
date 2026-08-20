import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { markRead } from '@/lib/notifications';

/**
 * PATCH /api/notifications/<id> — marks one read.
 *
 * The id comes from the caller, so ownership is checked by putting the
 * session's own id in the WHERE clause rather than by loading the row and
 * comparing: a row belonging to someone else simply matches nothing, and
 * there is no branch that can be forgotten.
 */
export async function PATCH(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const { found, changed } = await markRead(session.userId, params.id);

  // Not theirs or not real: the same 404 for both, so the endpoint cannot be
  // used to confirm that someone else's notification id exists.
  if (!found) {
    return NextResponse.json({ error: 'Notification not found.' }, { status: 404 });
  }

  // Already read — the caller's goal is met, so this is not a failure.
  return NextResponse.json({ ok: true, alreadyRead: !changed });
}
