import 'server-only';
import { sql, scalar } from '@/lib/sql';
import { newId } from '@/lib/id';

/**
 * What an account has been told.
 *
 * Every read and write here is bound to one client id and there is no
 * parameter for whose notifications to fetch, so an account can only ever
 * reach its own — the scoping is the query, not a check around it.
 */

export interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: Date | null;
  createdAt: Date;
}

/** The most recent fifty, and how many of them are unread. */
export async function notificationsFor(clientId: string): Promise<{
  notifications: NotificationRow[];
  unread: number;
}> {
  const [notifications, unread] = await Promise.all([
    sql<NotificationRow>`
      SELECT "id", "type", "title", "body", "link", "readAt", "createdAt"
      FROM "Notification"
      WHERE "clientId" = ${clientId}
      ORDER BY "createdAt" DESC
      LIMIT 50
    `,
    scalar`
      SELECT COUNT(*) FROM "Notification"
      WHERE "clientId" = ${clientId} AND "readAt" IS NULL
    `,
  ]);

  return { notifications, unread };
}

/**
 * Marks every unread one read, and says how many that was.
 *
 * Only the unread ones, so a second call cannot rewrite when the earlier ones
 * were seen.
 */
export async function markAllRead(clientId: string): Promise<number> {
  const rows = await sql<{ id: string }>`
    UPDATE "Notification" SET "readAt" = now()
    WHERE "clientId" = ${clientId} AND "readAt" IS NULL
    RETURNING "id"
  `;
  return rows.length;
}

/**
 * Marks one read, if it belongs to this account.
 *
 * Returns whether the row exists for them at all, so the route can tell a
 * notification that was already read from one that is somebody else's — the
 * first is a success and the second is a 404.
 */
export async function markRead(
  clientId: string,
  notificationId: string
): Promise<{ found: boolean; changed: boolean }> {
  const updated = await sql<{ id: string }>`
    UPDATE "Notification" SET "readAt" = now()
    WHERE "id" = ${notificationId} AND "clientId" = ${clientId} AND "readAt" IS NULL
    RETURNING "id"
  `;
  if (updated.length > 0) return { found: true, changed: true };

  const existing = await sql<{ id: string }>`
    SELECT "id" FROM "Notification"
    WHERE "id" = ${notificationId} AND "clientId" = ${clientId}
  `;
  return { found: existing.length > 0, changed: false };
}

export interface NewNotification {
  clientId: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
}

export async function sendNotification(input: NewNotification): Promise<NotificationRow & { clientName: string }> {
  const rows = await sql<NotificationRow & { clientName: string }>`
    WITH inserted AS (
      INSERT INTO "Notification" ("id", "clientId", "type", "title", "body", "link")
      VALUES (${newId()}, ${input.clientId}, ${input.type}, ${input.title},
              ${input.body}, ${input.link})
      RETURNING *
    )
    SELECT i."id", i."type", i."title", i."body", i."link", i."readAt", i."createdAt",
           c."name" AS "clientName"
    FROM inserted i
    JOIN "Client" c ON c."id" = i."clientId"
  `;
  return rows[0];
}

/** Everyone an admin can address, and how many unread each is carrying. */
export async function notificationRecipients(): Promise<
  { id: string; name: string; email: string; unread: number }[]
> {
  return sql<{ id: string; name: string; email: string; unread: number }>`
    SELECT c."id", c."name", c."email",
           COUNT(n."id") FILTER (WHERE n."readAt" IS NULL)::int AS unread
    FROM "Client" c
    LEFT JOIN "Notification" n ON n."clientId" = c."id"
    GROUP BY c."id"
    ORDER BY c."name" ASC
  `;
}

/** The most recent notifications across every account, for the admin list. */
export async function recentNotifications(
  limit: number
): Promise<(NotificationRow & { clientId: string; clientName: string })[]> {
  return sql<NotificationRow & { clientId: string; clientName: string }>`
    SELECT n."id", n."clientId", n."type", n."title", n."body", n."link",
           n."readAt", n."createdAt", c."name" AS "clientName"
    FROM "Notification" n
    JOIN "Client" c ON c."id" = n."clientId"
    ORDER BY n."createdAt" DESC
    LIMIT ${limit}
  `;
}
