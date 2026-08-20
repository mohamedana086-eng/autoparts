import 'server-only';
import { sql, one } from '@/lib/sql';
import { newId } from '@/lib/id';

/**
 * The four lists an admin or salesperson works from: accounts, abandoned
 * baskets, orders and what has been sent to whom.
 *
 * Every one of them is scoped. A salesperson sees the accounts they look
 * after and nothing else, and the scope is a condition inside the query rather
 * than a filter applied to the result — a filter is one forgotten `return`
 * away from serving the whole customer list.
 *
 * The scope is passed as `salesManagerId`: null means an admin, and the whole
 * table. It is spelled `${x}::text IS NULL OR ...` so that one static
 * statement covers both, with no branch where the condition could be dropped.
 */

/* -------------------------------------------------------------- accounts --- */

export interface ClientRow {
  id: string;
  name: string;
  email: string;
  role: string;
  city: string | null;
  hasLogin: boolean;
  categoryId: string | null;
  categoryName: string | null;
  discountPercent: number;
  currencyId: string | null;
  currencyCode: string | null;
  salesManagerId: string | null;
  salesManagerName: string | null;
}


export async function adminClients(salesManagerId: string | null): Promise<ClientRow[]> {
  return sql<ClientRow>`
    SELECT c."id", c."name", c."email", c."role", c."city",
           (c."passwordHash" IS NOT NULL) AS "hasLogin",
           c."categoryId", cat."name" AS "categoryName", c."discountPercent",
           c."currencyId", cur."code" AS "currencyCode",
           c."salesManagerId", m."name" AS "salesManagerName"
    FROM "Client" c
    LEFT JOIN "ClientCategory" cat ON cat."id" = c."categoryId"
    LEFT JOIN "Currency" cur ON cur."id" = c."currencyId"
    LEFT JOIN "Client" m ON m."id" = c."salesManagerId"
    WHERE (${salesManagerId}::text IS NULL OR c."salesManagerId" = ${salesManagerId})
    ORDER BY c."createdAt" DESC
  `;
}

export async function adminClientById(id: string): Promise<ClientRow | null> {
  return one<ClientRow>`
    SELECT c."id", c."name", c."email", c."role", c."city",
           (c."passwordHash" IS NOT NULL) AS "hasLogin",
           c."categoryId", cat."name" AS "categoryName", c."discountPercent",
           c."currencyId", cur."code" AS "currencyCode",
           c."salesManagerId", m."name" AS "salesManagerName"
    FROM "Client" c
    LEFT JOIN "ClientCategory" cat ON cat."id" = c."categoryId"
    LEFT JOIN "Currency" cur ON cur."id" = c."currencyId"
    LEFT JOIN "Client" m ON m."id" = c."salesManagerId"
    WHERE c."id" = ${id}
  `;
}

/** The selects on the customer editor: tiers, currencies, and who can own an account. */
export async function clientOptions(): Promise<{
  categories: { id: string; name: string }[];
  currencies: { id: string; name: string }[];
  salesManagers: { id: string; name: string }[];
}> {
  const [categories, currencies, salesManagers] = await Promise.all([
    sql<{ id: string; name: string }>`
      SELECT "id", "name" FROM "ClientCategory" ORDER BY "markupPercent" ASC
    `,
    sql<{ id: string; name: string }>`
      SELECT "id", "code" || ' — ' || "name" AS "name"
      FROM "Currency" WHERE "active" = TRUE ORDER BY "isBase" DESC, "code" ASC
    `,
    // Its own query, not derived from the scoped list: that one is narrowed to
    // a salesperson's own customers, which would leave the dropdown listing
    // whichever staff happened to be among them — usually none.
    sql<{ id: string; name: string }>`
      SELECT "id", "name" FROM "Client" WHERE "role" = 'SALES' ORDER BY "name" ASC
    `,
  ]);
  return { categories, currencies, salesManagers };
}

export async function categoryExists(id: string): Promise<boolean> {
  const row = await one<{ id: string }>`SELECT "id" FROM "ClientCategory" WHERE "id" = ${id}`;
  return row !== null;
}

export async function currencyForClient(
  id: string
): Promise<{ code: string; active: boolean } | null> {
  return one<{ code: string; active: boolean }>`
    SELECT "code", "active" FROM "Currency" WHERE "id" = ${id}
  `;
}

export async function clientRoleAndName(
  id: string
): Promise<{ role: string; name: string } | null> {
  return one<{ role: string; name: string }>`
    SELECT "role", "name" FROM "Client" WHERE "id" = ${id}
  `;
}

export async function updateClient(
  id: string,
  input: {
    role: string; categoryId: string | null; discountPercent: number;
    currencyId: string | null; salesManagerId: string | null;
  }
): Promise<void> {
  await sql`
    UPDATE "Client"
       SET "role" = ${input.role}, "categoryId" = ${input.categoryId},
           "discountPercent" = ${input.discountPercent}, "currencyId" = ${input.currencyId},
           "salesManagerId" = ${input.salesManagerId}
     WHERE "id" = ${id}
  `;
}

/* --------------------------------------------------------------- baskets --- */

export interface CartLine {
  productId: string;
  partNumber: string;
  name: string;
  quantity: number;
}

export interface CartRow {
  id: string;
  clientId: string;
  clientName: string;
  clientEmail: string;
  updatedAt: Date;
  units: number;
  cost: number;
  items: CartLine[];
}

/** How many baskets the list carries. It exists to be skimmed, not paged. */
export const CART_LIMIT = 200;

/**
 * Baskets that were filled and never ordered, oldest first.
 *
 * Oldest first because a basket sitting untouched for a fortnight is the one
 * worth a phone call, and it is the one a newest-first list buries.
 *
 * The lines are aggregated into the row rather than fetched per basket. Both
 * totals and the line list come out of one lateral, so two hundred baskets are
 * two hundred rows rather than two hundred round trips — and `cost` is summed
 * in the database instead of by adding up lines in memory.
 *
 * That cost is the catalogue's purchase price, not what the customer would
 * pay: pricing a basket per account means running the markup engine for every
 * line of every basket. The UI labels the column as cost for that reason.
 */
export async function abandonedCarts(salesManagerId: string | null): Promise<CartRow[]> {
  return sql<CartRow>`
    SELECT ct."id", cl."id" AS "clientId", cl."name" AS "clientName",
           cl."email" AS "clientEmail", ct."updatedAt",
           lines."units"::int AS "units", lines."cost", lines."items"
    FROM "Cart" ct
    JOIN "Client" cl ON cl."id" = ct."clientId"
    JOIN LATERAL (
      SELECT SUM(ci."quantity") AS "units",
             -- The active price list where it covers the part, the part's own
             -- price where it does not: the same fallback as everywhere else.
             SUM(ci."quantity" * COALESCE(pli."price", p."basePrice")) AS "cost",
             json_agg(
               json_build_object(
                 'productId', ci."productId", 'partNumber', p."partNumber",
                 'name', p."name", 'quantity', ci."quantity"
               ) ORDER BY ci."addedAt" ASC
             ) AS "items"
      FROM "CartItem" ci
      JOIN "Product" p ON p."id" = ci."productId"
      LEFT JOIN LATERAL (
        SELECT i."price"
        FROM "PriceListItem" i
        JOIN "PriceList" pl ON pl."id" = i."priceListId" AND pl."active"
        WHERE i."productId" = p."id"
        LIMIT 1
      ) pli ON TRUE
      WHERE ci."cartId" = ct."id"
    ) lines ON TRUE
    -- An inner lateral over an aggregate always returns a row, so an empty
    -- basket would come through with a null unit count rather than be
    -- dropped. Excluded by the count, which is what "filled" means.
    WHERE lines."units" IS NOT NULL
      AND (${salesManagerId}::text IS NULL OR cl."salesManagerId" = ${salesManagerId})
    ORDER BY ct."updatedAt" ASC
    LIMIT ${CART_LIMIT}
  `;
}

/* ---------------------------------------------------------- notifications --- */

export interface AdminNotificationRow {
  id: string;
  clientId: string;
  clientName: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: Date | null;
  createdAt: Date;
}

/** How many to show. Newest first; the rest is history nobody scrolls to. */
export const NOTIFICATION_LIMIT = 200;

export async function sentNotifications(): Promise<AdminNotificationRow[]> {
  return sql<AdminNotificationRow>`
    SELECT n."id", n."clientId", c."name" AS "clientName", n."type", n."title",
           n."body", n."link", n."readAt", n."createdAt"
    FROM "Notification" n
    JOIN "Client" c ON c."id" = n."clientId"
    ORDER BY n."createdAt" DESC
    LIMIT ${NOTIFICATION_LIMIT}
  `;
}

export async function notificationRecipients(): Promise<{ id: string; name: string }[]> {
  return sql<{ id: string; name: string }>`
    SELECT "id", "name" || ' — ' || "email" AS "name"
    FROM "Client"
    ORDER BY "name" ASC
  `;
}

export async function sendNotification(input: {
  clientId: string; type: string; title: string; body: string | null; link: string | null;
}): Promise<AdminNotificationRow> {
  const id = newId();
  await sql`
    INSERT INTO "Notification" ("id", "clientId", "type", "title", "body", "link")
    VALUES (${id}, ${input.clientId}, ${input.type}, ${input.title}, ${input.body}, ${input.link})
  `;
  return (await one<AdminNotificationRow>`
    SELECT n."id", n."clientId", c."name" AS "clientName", n."type", n."title",
           n."body", n."link", n."readAt", n."createdAt"
    FROM "Notification" n
    JOIN "Client" c ON c."id" = n."clientId"
    WHERE n."id" = ${id}
  `)!;
}

export async function clientExists(id: string): Promise<boolean> {
  const row = await one<{ id: string }>`SELECT "id" FROM "Client" WHERE "id" = ${id}`;
  return row !== null;
}

/* ---------------------------------------------------------------- orders --- */

export interface AdminOrderLine {
  productId: string;
  partNumber: string;
  name: string;
  manufacturer: string;
  system: string;
  quantity: number;
  unitPrice: number;
}

export interface AdminOrderRow {
  id: string;
  reference: string;
  clientName: string;
  status: string;
  createdAt: Date;
  units: number;
  /** Distinct parts, which is the number `units` alone cannot imply. */
  lineCount: number;
  /** Base currency, summed from the lines actually stored. */
  total: number;
  currencyCode: string;
  currencyRate: number;
  lines: AdminOrderLine[];
}

/**
 * Every order the caller may see, newest first, with its lines.
 *
 * The parts come down with the list rather than behind a request per order. A
 * unit total answers "how much" and nothing else — four of one part and one
 * each of four read identically — so the table would have to fire a request
 * per row while being scrolled to say anything useful.
 */
export async function adminOrders(salesManagerId: string | null): Promise<AdminOrderRow[]> {
  return sql<AdminOrderRow>`
    SELECT o."id", o."reference", cl."name" AS "clientName", o."status", o."createdAt",
           COALESCE(lines."units", 0)::int AS "units",
           COALESCE(lines."lineCount", 0)::int AS "lineCount",
           COALESCE(lines."total", 0) AS "total",
           o."currencyCode", o."currencyRate",
           COALESCE(lines."lines", '[]'::json) AS "lines"
    FROM "Order" o
    JOIN "Client" cl ON cl."id" = o."clientId"
    LEFT JOIN LATERAL (
      SELECT SUM(oi."quantity") AS "units",
             COUNT(*) AS "lineCount",
             SUM(oi."unitPrice" * oi."quantity") AS "total",
             json_agg(
               json_build_object(
                 'productId', oi."productId", 'partNumber', p."partNumber", 'name', p."name",
                 'manufacturer', m."name", 'system', vs."name",
                 'quantity', oi."quantity", 'unitPrice', oi."unitPrice"
               -- By line id, which for cuids is the order they were written
               -- in, and so the order the customer built the basket in. The
               -- ORM asked for no order at all and got heap order, which
               -- happens to be the same today and is guaranteed to be nothing
               -- tomorrow — an admin comparing two screens deserves better.
               ) ORDER BY oi."id" ASC
             ) AS "lines"
      FROM "OrderItem" oi
      JOIN "Product" p ON p."id" = oi."productId"
      JOIN "Manufacturer" m ON m."id" = p."manufacturerId"
      JOIN "VehicleSystem" vs ON vs."id" = p."vehicleSystemId"
      WHERE oi."orderId" = o."id"
    ) lines ON TRUE
    WHERE (${salesManagerId}::text IS NULL OR cl."salesManagerId" = ${salesManagerId})
    ORDER BY o."createdAt" DESC
  `;
}

/* ------------------------------------------------------------ dashboard --- */

export interface DashboardCounts {
  products: number;
  clients: number;
  orders: number;
  activeRules: number | null;
}

/**
 * The dashboard figures, in one round trip.
 *
 * The catalogue count is not scoped for anyone: the storefront search is
 * public, so its size is not something staff are being shown early.
 *
 * `activeRules` is left out for SALES rather than scoped, because there is no
 * such thing as their share of the markup rules — pricing is admin-only, and a
 * number they can neither reach nor act on is furniture.
 */
export async function dashboardCounts(
  salesManagerId: string | null
): Promise<DashboardCounts> {
  const row = await one<{
    products: number; clients: number; orders: number; activeRules: number;
  }>`
    SELECT (SELECT COUNT(*) FROM "Product")::int AS "products",
           (SELECT COUNT(*) FROM "Client" c
             WHERE (${salesManagerId}::text IS NULL OR c."salesManagerId" = ${salesManagerId})
           )::int AS "clients",
           (SELECT COUNT(*) FROM "Order" o
              JOIN "Client" c ON c."id" = o."clientId"
             WHERE (${salesManagerId}::text IS NULL OR c."salesManagerId" = ${salesManagerId})
           )::int AS "orders",
           (SELECT COUNT(*) FROM "MarkupRule" WHERE "active")::int AS "activeRules"
  `;

  return {
    products: row?.products ?? 0,
    clients: row?.clients ?? 0,
    orders: row?.orders ?? 0,
    activeRules: salesManagerId === null ? row?.activeRules ?? 0 : null,
  };
}
