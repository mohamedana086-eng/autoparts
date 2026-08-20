/**
 * Plans the importer's write statements without running them.
 *
 * `db:import:tecdoc` without `--apply` reads and reports but writes nothing,
 * so a dry run proves the read path and leaves every INSERT and UPDATE in the
 * job unexercised. Applying it against the only database available would put
 * fixture articles into a live catalogue.
 *
 * EXPLAIN is the way out: Postgres parses and plans each statement in full —
 * column names, types, array casts, the indexes an ON CONFLICT needs — and
 * then throws the plan away. Nothing is written and no row is locked.
 *
 *   npx tsx --conditions=react-server prisma/explain-writes.ts
 */
import { loadEnv } from './env';
import { sql } from '@/lib/sql';
import { newId } from '@/lib/id';

const id = newId();
const ints: number[] = [];
const strs: string[] = [];
const bools: boolean[] = [];

/** Each statement below is copied from import-tecdoc.ts, parameters and all. */
const STATEMENTS: Array<[string, () => Promise<unknown>]> = [
  [
    'Manufacturer upsert',
    () => sql`
      EXPLAIN INSERT INTO "Manufacturer" ("id", "name", "isOEM")
      VALUES (${id}, ${'BOSCH'}, ${false})
      ON CONFLICT ("name") DO UPDATE SET "name" = EXCLUDED."name"
      RETURNING "id"
    `,
  ],
  [
    'Product match on tecDocId or part number',
    () => sql`
      EXPLAIN SELECT p."id", m."name" AS "manufacturerName"
      FROM "Product" p
      JOIN "Manufacturer" m ON m."id" = p."manufacturerId"
      WHERE (${1234}::int IS NOT NULL AND p."tecDocId" = ${1234})
         OR p."partNumber" = ${'X'}
      LIMIT 1
    `,
  ],
  [
    'Product update (catalogue fields only)',
    () => sql`
      EXPLAIN UPDATE "Product"
         SET "name" = ${'n'}, "description" = ${null}, "manufacturerId" = ${id},
             "vehicleSystemId" = ${id}, "tecDocId" = ${1}
       WHERE "id" = ${id}
    `,
  ],
  [
    'Product insert at basePrice 0',
    () => sql`
      EXPLAIN INSERT INTO "Product" ("id", "partNumber", "name", "description", "manufacturerId",
                             "vehicleSystemId", "tecDocId", "basePrice", "stockDays")
      VALUES (${id}, ${'X'}, ${'n'}, ${null}, ${id}, ${id}, ${1}, 0, ${1})
    `,
  ],
  [
    'Interchange wholesale delete',
    () => sql`EXPLAIN DELETE FROM "Interchange" WHERE "sourceId" = ${id}`,
  ],
  [
    'Interchange bulk insert',
    () => sql`
      EXPLAIN INSERT INTO "Interchange" ("id", "sourceId", "targetPartNo", "targetManufacturer",
                                 "exactMatch", "isOEM")
      SELECT * FROM unnest(
        ${strs}::text[], ${strs}::text[], ${strs}::text[], ${strs}::text[],
        ${bools}::boolean[], ${bools}::boolean[]
      )
    `,
  ],
  [
    'VehicleMake match',
    () => sql`
      EXPLAIN SELECT "id", "tecDocId" FROM "VehicleMake"
      WHERE "tecDocId" = ${1} OR "name" = ${'BMW'}
      LIMIT 1
    `,
  ],
  [
    'VehicleMake adopt tecDocId',
    () => sql`EXPLAIN UPDATE "VehicleMake" SET "tecDocId" = ${1} WHERE "id" = ${id}`,
  ],
  [
    'VehicleMake insert',
    () => sql`
      EXPLAIN INSERT INTO "VehicleMake" ("id", "name", "wmiCodes", "tecDocId")
      VALUES (${id}, ${'BMW'}, ${strs}::text[], ${1})
    `,
  ],
  [
    'VehicleModel match',
    () => sql`
      EXPLAIN SELECT "id" FROM "VehicleModel"
      WHERE "tecDocId" = ${1} OR ("makeId" = ${id} AND "name" = ${'n'})
      LIMIT 1
    `,
  ],
  [
    'VehicleModel update',
    () => sql`
      EXPLAIN UPDATE "VehicleModel"
         SET "yearFrom" = ${1}, "yearTo" = ${null}, "tecDocId" = ${1}
       WHERE "id" = ${id}
    `,
  ],
  [
    'VehicleModel insert',
    () => sql`
      EXPLAIN INSERT INTO "VehicleModel" ("id", "makeId", "name", "yearFrom", "yearTo", "tecDocId")
      VALUES (${id}, ${id}, ${'n'}, ${1}, ${null}, ${1})
    `,
  ],
  [
    'VehicleVariant match',
    () => sql`
      EXPLAIN SELECT "id" FROM "VehicleVariant"
      WHERE "tecDocId" = ${1} OR ("modelId" = ${id} AND "name" = ${'n'})
      LIMIT 1
    `,
  ],
  [
    'VehicleVariant update',
    () => sql`
      EXPLAIN UPDATE "VehicleVariant"
         SET "engineCode" = ${null}, "powerKw" = ${null}, "fuel" = ${'diesel'},
             "yearFrom" = ${1}, "yearTo" = ${null}, "tecDocId" = ${1}
       WHERE "id" = ${id}
    `,
  ],
  [
    'VehicleVariant insert',
    () => sql`
      EXPLAIN INSERT INTO "VehicleVariant" ("id", "modelId", "name", "engineCode", "powerKw",
                                    "fuel", "yearFrom", "yearTo", "tecDocId")
      VALUES (${id}, ${id}, ${'n'}, ${null}, ${null}, ${'diesel'}, ${1}, ${null}, ${1})
    `,
  ],
  [
    'Fitment upsert',
    () => sql`
      EXPLAIN INSERT INTO "Fitment" ("id", "productId", "variantId", "note")
      VALUES (${id}, ${id}, ${id}, ${null})
      ON CONFLICT ("productId", "variantId") DO UPDATE SET "note" = EXCLUDED."note"
    `,
  ],
  [
    'unpriced count',
    () => sql`EXPLAIN SELECT COUNT(*) FROM "Product" WHERE "basePrice" <= 0`,
  ],
];

async function main() {
  console.log(`planning ${STATEMENTS.length} write statements — nothing is executed\n`);
  let failed = 0;

  for (const [label, run] of STATEMENTS) {
    try {
      const plan = (await run()) as unknown[];
      console.log(`  ok    ${label.padEnd(42)} ${plan.length} plan row(s)`);
    } catch (e) {
      failed++;
      console.log(`  FAIL  ${label}`);
      console.log(`        ${(e as Error).message}`);
    }
  }

  console.log(`\n${STATEMENTS.length - failed}/${STATEMENTS.length} planned cleanly.`);
  if (failed > 0) process.exitCode = 1;
}

loadEnv();
void ints;
main().then(
  () => process.exit(process.exitCode ?? 0),
  (e) => {
    console.error(e);
    process.exit(1);
  }
);
