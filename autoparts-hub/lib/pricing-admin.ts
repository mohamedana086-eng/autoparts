import 'server-only';
import { sql, one, tx } from '@/lib/sql';
import { newId } from '@/lib/id';

/**
 * What the admin sets prices with: currencies, client tiers, markup rules and
 * purchase price lists.
 *
 * One module because they are one screen's worth of decisions — a rule can
 * target a tier, a tier prices a client, a client is quoted in a currency, and
 * a price list sets the cost the rules are applied to.
 */

/* ----------------------------------------------------------- currencies --- */

export interface CurrencyRow {
  id: string;
  code: string;
  name: string;
  symbol: string;
  rate: number;
  isBase: boolean;
  active: boolean;
  clientCount: number;
}

/**
 * Every currency, with how many accounts are quoted in it.
 *
 * Base first, then alphabetical: the base is the one everything else is
 * measured against, so it belongs at the top rather than under E.
 */
export async function adminCurrencies(id?: string): Promise<CurrencyRow[]> {
  return sql<CurrencyRow>`
    SELECT c."id", c."code", c."name", c."symbol", c."rate", c."isBase", c."active",
           n."count"::int AS "clientCount"
    FROM "Currency" c
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS "count" FROM "Client" cl WHERE cl."currencyId" = c."id"
    ) n ON TRUE
    WHERE (${id ?? null}::text IS NULL OR c."id" = ${id ?? null})
    ORDER BY c."isBase" DESC, c."code" ASC
  `;
}

export async function currencyById(id: string): Promise<CurrencyRow | null> {
  return (await adminCurrencies(id))[0] ?? null;
}

export async function currencyIdByCode(code: string): Promise<string | null> {
  const row = await one<{ id: string }>`SELECT "id" FROM "Currency" WHERE "code" = ${code}`;
  return row?.id ?? null;
}

export interface CurrencyWrite {
  code: string; name: string; symbol: string; rate: number; active: boolean;
}

export async function createCurrency(input: CurrencyWrite): Promise<string> {
  // Never created as base: which currency prices are denominated in is a
  // property of the catalogue, not something a create form gets to assert.
  const row = await one<{ id: string }>`
    INSERT INTO "Currency" ("id", "code", "name", "symbol", "rate", "isBase", "active")
    VALUES (${newId()}, ${input.code}, ${input.name}, ${input.symbol}, ${input.rate},
            FALSE, ${input.active})
    RETURNING "id"
  `;
  return row!.id;
}

export async function updateCurrency(id: string, input: CurrencyWrite): Promise<void> {
  await sql`
    UPDATE "Currency"
       SET "code" = ${input.code}, "name" = ${input.name}, "symbol" = ${input.symbol},
           "rate" = ${input.rate}, "active" = ${input.active}
     WHERE "id" = ${id}
  `;
}

export async function deleteCurrency(id: string): Promise<void> {
  await sql`DELETE FROM "Currency" WHERE "id" = ${id}`;
}

/* --------------------------------------------------------- client tiers --- */

export interface CategoryRow {
  id: string;
  name: string;
  markupPercent: number;
  minOrderAmount: number;
  shelfLifeDays: number;
  clientCount: number;
}


/** Tiers cheapest markup first, which is the order they are reasoned about. */
export async function adminCategories(): Promise<CategoryRow[]> {
  return sql<CategoryRow>`
    SELECT c."id", c."name", c."markupPercent", c."minOrderAmount", c."shelfLifeDays",
           n."count"::int AS "clientCount"
    FROM "ClientCategory" c
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS "count" FROM "Client" cl WHERE cl."categoryId" = c."id"
    ) n ON TRUE
    ORDER BY c."markupPercent" ASC
  `;
}

export async function createCategory(input: {
  name: string; markupPercent: number; minOrderAmount: number; shelfLifeDays: number;
}): Promise<CategoryRow> {
  const row = await one<CategoryRow>`
    INSERT INTO "ClientCategory" ("id", "name", "markupPercent", "minOrderAmount", "shelfLifeDays")
    VALUES (${newId()}, ${input.name}, ${input.markupPercent}, ${input.minOrderAmount},
            ${input.shelfLifeDays})
    RETURNING "id", "name", "markupPercent", "minOrderAmount", "shelfLifeDays",
              0 AS "clientCount"
  `;
  return row!;
}

export async function categoryNameById(id: string): Promise<string | null> {
  const row = await one<{ name: string }>`
    SELECT "name" FROM "ClientCategory" WHERE "id" = ${id}
  `;
  return row?.name ?? null;
}

/** What still points at a tier, and so what stops it being deleted. */
export async function categoryReferences(
  id: string
): Promise<{ clients: number; markupRules: number }> {
  const row = await one<{ clients: number; markupRules: number }>`
    SELECT (SELECT COUNT(*) FROM "Client" WHERE "categoryId" = ${id})::int AS "clients",
           (SELECT COUNT(*) FROM "MarkupRule" WHERE "clientCategoryId" = ${id})::int AS "markupRules"
  `;
  return row ?? { clients: 0, markupRules: 0 };
}

export async function deleteCategory(id: string): Promise<void> {
  await sql`DELETE FROM "ClientCategory" WHERE "id" = ${id}`;
}

/* --------------------------------------------------------- markup rules --- */

export interface MarkupRuleRow {
  id: string;
  label: string;
  priority: number;
  clientCategoryId: string | null;
  clientCategoryName: string | null;
  supplierId: string | null;
  supplierName: string | null;
  manufacturerName: string | null;
  vehicleSystemSlug: string | null;
  partNumberPrefix: string | null;
  purchasePriceFrom: number | null;
  purchasePriceTo: number | null;
  type: string;
  value: number;
  active: boolean;
}

/**
 * Rules highest priority first, each naming the tier and supplier it targets.
 *
 * The two names are joined rather than looked up per rule: the list is read to
 * see which rule wins, and a rule that says only "category cm3x..." cannot be
 * read at all.
 */
export async function adminMarkupRules(id?: string): Promise<MarkupRuleRow[]> {
  return sql<MarkupRuleRow>`
    SELECT r."id", r."label", r."priority",
           r."clientCategoryId", cc."name" AS "clientCategoryName",
           r."supplierId", s."name" AS "supplierName",
           r."manufacturerName", r."vehicleSystemSlug", r."partNumberPrefix",
           r."purchasePriceFrom", r."purchasePriceTo", r."type", r."value", r."active"
    FROM "MarkupRule" r
    LEFT JOIN "ClientCategory" cc ON cc."id" = r."clientCategoryId"
    LEFT JOIN "Supplier" s ON s."id" = r."supplierId"
    WHERE (${id ?? null}::text IS NULL OR r."id" = ${id ?? null})
    ORDER BY r."priority" DESC
  `;
}

export async function markupRuleById(id: string): Promise<MarkupRuleRow | null> {
  return (await adminMarkupRules(id))[0] ?? null;
}

export interface MarkupRuleWrite {
  label: string; priority: number;
  clientCategoryId: string | null; supplierId: string | null;
  manufacturerName: string | null; vehicleSystemSlug: string | null;
  partNumberPrefix: string | null;
  purchasePriceFrom: number | null; purchasePriceTo: number | null;
  type: string; value: number;
}

export async function createMarkupRule(input: MarkupRuleWrite): Promise<MarkupRuleRow> {
  const id = newId();
  await sql`
    INSERT INTO "MarkupRule" ("id", "label", "priority", "clientCategoryId", "supplierId",
                              "manufacturerName", "vehicleSystemSlug", "partNumberPrefix",
                              "purchasePriceFrom", "purchasePriceTo", "type", "value")
    VALUES (${id}, ${input.label}, ${input.priority}, ${input.clientCategoryId},
            ${input.supplierId}, ${input.manufacturerName}, ${input.vehicleSystemSlug},
            ${input.partNumberPrefix}, ${input.purchasePriceFrom}, ${input.purchasePriceTo},
            ${input.type}, ${input.value})
  `;
  return (await markupRuleById(id))!;
}

export async function markupRuleExists(id: string): Promise<boolean> {
  const row = await one<{ id: string }>`SELECT "id" FROM "MarkupRule" WHERE "id" = ${id}`;
  return row !== null;
}

export async function setMarkupRuleActive(id: string, active: boolean): Promise<void> {
  await sql`UPDATE "MarkupRule" SET "active" = ${active} WHERE "id" = ${id}`;
}

export async function deleteMarkupRule(id: string): Promise<void> {
  await sql`DELETE FROM "MarkupRule" WHERE "id" = ${id}`;
}

/** The selects in the rule builder: tiers, suppliers and systems to target. */
export async function markupRuleOptions(): Promise<{
  categories: { id: string; name: string }[];
  suppliers: { id: string; name: string }[];
  systems: { slug: string; name: string }[];
}> {
  const [categories, suppliers, systems] = await Promise.all([
    sql<{ id: string; name: string }>`
      SELECT "id", "name" FROM "ClientCategory" ORDER BY "markupPercent" ASC
    `,
    sql<{ id: string; name: string }>`SELECT "id", "name" FROM "Supplier"`,
    sql<{ slug: string; name: string }>`
      SELECT "slug", "name" FROM "VehicleSystem" ORDER BY "order" ASC
    `,
  ]);
  return { categories, suppliers, systems };
}

/* ---------------------------------------------------------- price lists --- */

export interface PriceListRow {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  sourceName: string | null;
  itemCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Active first, then newest — the one setting prices is the one being read. */
export async function adminPriceLists(id?: string): Promise<PriceListRow[]> {
  return sql<PriceListRow>`
    SELECT l."id", l."name", l."description", l."active", l."sourceName",
           n."count"::int AS "itemCount", l."createdAt", l."updatedAt"
    FROM "PriceList" l
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS "count" FROM "PriceListItem" i WHERE i."priceListId" = l."id"
    ) n ON TRUE
    WHERE (${id ?? null}::text IS NULL OR l."id" = ${id ?? null})
    ORDER BY l."active" DESC, l."createdAt" DESC
  `;
}

export async function priceListById(id: string): Promise<PriceListRow | null> {
  return (await adminPriceLists(id))[0] ?? null;
}

export interface PriceListLine {
  productId: string;
  partNumber: string;
  name: string;
  price: number;
  sourcePrice: number | null;
  sourceCurrency: string | null;
  /** What the part costs without this list, so the change is visible. */
  basePrice: number;
}

export async function priceListItems(id: string, limit: number): Promise<PriceListLine[]> {
  return sql<PriceListLine>`
    SELECT i."productId", p."partNumber", p."name", i."price", i."sourcePrice",
           i."sourceCurrency", p."basePrice"
    FROM "PriceListItem" i
    JOIN "Product" p ON p."id" = i."productId"
    WHERE i."priceListId" = ${id}
    ORDER BY p."partNumber" ASC
    LIMIT ${limit}
  `;
}

/** Part numbers to match an upload against, and the rates to convert it with. */
export async function priceListReferences(): Promise<{
  products: { id: string; partNumber: string }[];
  currencies: { code: string; rate: number }[];
}> {
  const [products, currencies] = await Promise.all([
    sql<{ id: string; partNumber: string }>`SELECT "id", "partNumber" FROM "Product"`,
    sql<{ code: string; rate: number }>`SELECT "code", "rate" FROM "Currency"`,
  ]);
  return { products, currencies };
}

export interface PriceRowWrite {
  productId: string;
  price: number;
  sourcePrice: number | null;
  sourceCurrency: string | null;
}

/** Lines per insert. An upload is one statement per chunk, not one per row. */
const INSERT_CHUNK = 5000;

/**
 * Stores an upload: the list, then its lines, in one transaction.
 *
 * The lines go in as five arrays unnested into rows rather than one statement
 * per line — a supplier file is tens of thousands of prices, and that many
 * round trips is the difference between a request and a timeout.
 *
 * `updatedAt` is set here because the column is NOT NULL with no default. The
 * ORM filled it in on the way past; nothing else does.
 */
export async function createPriceList(
  details: { name: string; description: string | null; sourceName: string | null },
  rows: PriceRowWrite[]
): Promise<PriceListRow> {
  const id = newId();

  await tx(async (t) => {
    await t.sql`
      INSERT INTO "PriceList" ("id", "name", "description", "sourceName", "active", "updatedAt")
      VALUES (${id}, ${details.name}, ${details.description}, ${details.sourceName},
              FALSE, CURRENT_TIMESTAMP)
    `;

    for (let at = 0; at < rows.length; at += INSERT_CHUNK) {
      const chunk = rows.slice(at, at + INSERT_CHUNK);
      await t.sql`
        INSERT INTO "PriceListItem" ("id", "priceListId", "productId", "price",
                                     "sourcePrice", "sourceCurrency")
        SELECT * FROM unnest(
          ${chunk.map(() => newId())}::text[],
          ${chunk.map(() => id)}::text[],
          ${chunk.map((r) => r.productId)}::text[],
          ${chunk.map((r) => r.price)}::double precision[],
          ${chunk.map((r) => r.sourcePrice)}::double precision[],
          ${chunk.map((r) => r.sourceCurrency)}::text[]
        )
      `;
    }
  });

  return (await priceListById(id))!;
}

/**
 * Renames a list, switches it on or off, or both.
 *
 * At most one list may be active and the database enforces that with a partial
 * unique index, so standing the previous one down happens in the same
 * transaction — otherwise the write fails, which is the constraint doing its
 * job but not an error anyone should have to see. Switching a list on
 * therefore switches the other off, which is what "activate this one instead"
 * means.
 *
 * Each field is written through a CASE on whether the caller sent it, rather
 * than by ignoring nulls: a description can be cleared, and null is the way
 * that is said.
 */
export async function updatePriceList(
  id: string,
  fields: { name?: string; description?: string | null; active?: boolean }
): Promise<void> {
  await tx(async (t) => {
    if (fields.active === true) {
      await t.sql`UPDATE "PriceList" SET "active" = FALSE WHERE "active" = TRUE AND "id" <> ${id}`;
    }

    await t.sql`
      UPDATE "PriceList"
         SET "name" = CASE WHEN ${fields.name !== undefined} THEN ${fields.name ?? null}::text
                           ELSE "name" END,
             "description" = CASE WHEN ${fields.description !== undefined}
                                  THEN ${fields.description ?? null}::text
                                  ELSE "description" END,
             "active" = CASE WHEN ${fields.active !== undefined}
                             THEN ${fields.active ?? null}::boolean
                             ELSE "active" END,
             "updatedAt" = CURRENT_TIMESTAMP
       WHERE "id" = ${id}
    `;
  });
}

export async function deletePriceList(id: string): Promise<void> {
  // Its lines go with it: the cascade is on the foreign key.
  await sql`DELETE FROM "PriceList" WHERE "id" = ${id}`;
}
