import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';

/**
 * GET /api/notifications — the signed-in account's own.
 *
 * Scoped to the session's own id and nothing else. There is no id parameter to
 * pass, so there is nothing to tamper with: an account can only ever ask for
 * its own.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const [notifications, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { clientId: session.userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    prisma.notification.count({ where: { clientId: session.userId, readAt: null } }),
  ]);

  return NextResponse.json({
    unread,
    notifications: notifications.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      link: n.link,
      readAt: n.readAt?.toISOString() ?? null,
      createdAt: n.createdAt.toISOString(),
    })),
  });
}

// POST /api/notifications — marks every unread one read.
export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  // Only the ones still unread, so a second call cannot rewrite when the
  // earlier ones were seen.
  const result = await prisma.notification.updateMany({
    where: { clientId: session.userId, readAt: null },
    data: { readAt: new Date() },
  });

  return NextResponse.json({ ok: true, marked: result.count });
}
