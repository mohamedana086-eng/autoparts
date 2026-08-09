import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';

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

  const result = await prisma.notification.updateMany({
    where: { id: params.id, clientId: session.userId, readAt: null },
    data: { readAt: new Date() },
  });

  // Nothing matched: either it is not theirs, it does not exist, or it was
  // already read. Reporting the same 404 for all three keeps the endpoint from
  // confirming that someone else's notification id is real.
  if (result.count === 0) {
    const stillTheirs = await prisma.notification.findFirst({
      where: { id: params.id, clientId: session.userId },
      select: { id: true, readAt: true },
    });
    if (!stillTheirs) {
      return NextResponse.json({ error: 'Notification not found.' }, { status: 404 });
    }
    // Already read — the caller's goal is met, so this is not a failure.
    return NextResponse.json({ ok: true, readAt: stillTheirs.readAt?.toISOString() ?? null });
  }

  return NextResponse.json({ ok: true });
}
