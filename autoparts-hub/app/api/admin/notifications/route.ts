import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-guard';
import { isSitePath } from '@/lib/site-link';

// Not exported: Next only lets a route module export its handlers and a fixed
// set of config names, and exporting anything else breaks the generated route
// types — the same constraint that put the product helpers in lib/.
const NOTIFICATION_TYPES = ['system', 'order', 'stock', 'account'] as const;

// GET /api/admin/notifications — what has been sent, and who it can be sent to.
export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  const [notifications, recipients] = await Promise.all([
    prisma.notification.findMany({
      include: { client: { select: { name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
    prisma.client.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, email: true } }),
  ]);

  return NextResponse.json({
    notifications: notifications.map((n) => ({
      id: n.id,
      clientId: n.clientId,
      clientName: n.client.name,
      type: n.type,
      title: n.title,
      body: n.body,
      link: n.link,
      readAt: n.readAt?.toISOString() ?? null,
      createdAt: n.createdAt.toISOString(),
    })),
    recipients: recipients.map((c) => ({ id: c.id, name: `${c.name} — ${c.email}` })),
  });
}

// POST /api/admin/notifications — send one to an account.
export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  const clientId = String(body.clientId ?? '').trim();
  const title = String(body.title ?? '').trim();
  const rawType = String(body.type ?? 'system').trim();
  const messageBody = String(body.body ?? '').trim();
  const link = String(body.link ?? '').trim();

  if (!clientId) return NextResponse.json({ error: 'Pick who it goes to.' }, { status: 400 });
  if (!title) return NextResponse.json({ error: 'A title is required.' }, { status: 400 });
  if (title.length > 200) {
    return NextResponse.json({ error: 'Keep the title under 200 characters.' }, { status: 400 });
  }

  // Narrowed here the same way roles are — see toRole() in lib/auth.ts.
  const type = (NOTIFICATION_TYPES as readonly string[]).includes(rawType) ? rawType : 'system';

  // Site-relative only. A notification is rendered as a link the recipient
  // clicks, and an off-site destination typed into an admin box is the shape
  // of a phishing link even when nobody meant it that way.
  //
  // This used to be startsWith('/'), which let //evil.example straight through
  // — off-site by every browser's reading, and the exact thing being refused.
  if (link && !isSitePath(link)) {
    return NextResponse.json(
      { error: 'A link must be a path on this site, starting with /.' },
      { status: 400 }
    );
  }

  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) return NextResponse.json({ error: 'Unknown account.' }, { status: 400 });

  const notification = await prisma.notification.create({
    data: { clientId, type, title, body: messageBody || null, link: link || null },
    include: { client: { select: { name: true, email: true } } },
  });

  return NextResponse.json(
    {
      notification: {
        id: notification.id,
        clientId: notification.clientId,
        clientName: notification.client.name,
        type: notification.type,
        title: notification.title,
        body: notification.body,
        link: notification.link,
        readAt: null,
        createdAt: notification.createdAt.toISOString(),
      },
    },
    { status: 201 }
  );
}
