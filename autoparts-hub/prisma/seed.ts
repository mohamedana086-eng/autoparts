/**
 * A working shop from an empty database.
 * --------------------------------------
 * Systems, brands, suppliers, pricing tiers, three logins, five parts and the
 * markup rules that price them. Written for a database with nothing in it —
 * every insert here is a plain INSERT, not an upsert, so running it twice
 * fails on a unique key rather than quietly doubling the catalogue.
 *
 * The other seeds are the idempotent ones: seed-catalog, seed-vehicles,
 * seed-suppliers and seed-stock are all safe to re-run on a live database.
 *
 *   npm run db:seed
 */
import bcrypt from 'bcryptjs';
import { loadEnv } from './env';
import { sql } from '@/lib/sql';
import { newId } from '@/lib/id';

/** A row with a generated id, ready to insert and to refer to afterwards. */
function withIds<T>(rows: T[]): (T & { id: string })[] {
  return rows.map((r) => ({ ...r, id: newId() }));
}

/**
 * How the seed talks to the database.
 *
 * Normally the one-shot `sql`. Under `--dry` it is a runner that plans each
 * statement and discards it, so the whole script can be checked against the
 * real schema while the only database available already has a shop in it.
 * See `explaining()` at the foot of the file.
 */
type Run = typeof sql;

async function main(run: Run) {
  // --- Vehicle systems (matches the FastClick-style category tree) ---
  const systems = withIds(
    (
      [
        ['Brake System', 'brake-system', 'Disc'],
        ['Drive System', 'drive-system', 'Cog'],
        ['Steering', 'steering', 'Navigation'],
        ['Wheels', 'wheels', 'CircleDot'],
        ['Filter', 'filter', 'Filter'],
        ['Cooling System', 'cooling-system', 'Thermometer'],
        ['Ignition and Glow', 'ignition-glow', 'Zap'],
        ['Fuel System', 'fuel-system', 'Fuel'],
        ['Air Conditioning', 'air-conditioning', 'Wind'],
        ['Electrics', 'electrics', 'Cable'],
        ['Lights', 'lights', 'Lightbulb'],
        ['Body', 'body', 'Car'],
      ] as const
    ).map(([name, slug, icon], order) => ({ name, slug, icon, order }))
  );

  // Five arrays unnested into rows, rather than twelve round trips. The same
  // shape every list in this file uses.
  await run`
    INSERT INTO "VehicleSystem" ("id", "name", "slug", "icon", "order")
    SELECT * FROM unnest(
      ${systems.map((s) => s.id)}::text[],
      ${systems.map((s) => s.name)}::text[],
      ${systems.map((s) => s.slug)}::text[],
      ${systems.map((s) => s.icon)}::text[],
      ${systems.map((s) => s.order)}::int[]
    )
  `;

  // --- Manufacturers ---
  const manufacturers = withIds(
    ['BMW', 'NISSAN', 'TOYOTA', 'HYUNDAI', 'METALCAUCHO'].map((name) => ({
      name,
      isOEM: name !== 'METALCAUCHO',
    }))
  );
  await run`
    INSERT INTO "Manufacturer" ("id", "name", "isOEM")
    SELECT * FROM unnest(
      ${manufacturers.map((m) => m.id)}::text[],
      ${manufacturers.map((m) => m.name)}::text[],
      ${manufacturers.map((m) => m.isOEM)}::boolean[]
    )
  `;
  const brand = (name: string) => manufacturers.find((m) => m.name === name)!.id;

  // --- Suppliers ---
  // slug is what a supplier's public page is addressed by; seed-suppliers.ts
  // fills in the descriptions and sources each part.
  const suppliers = withIds(
    (
      [
        ['IB16 Parts', 'IB16', 'ib16-parts', 'official'],
        ['NP20 Distribution', 'NP20', 'np20-distribution', 'reliable'],
        ['BR02 Supply', 'BR02', 'br02-supply', 'standard'],
      ] as const
    ).map(([name, code, slug, reliability]) => ({ name, code, slug, reliability }))
  );
  await run`
    INSERT INTO "Supplier" ("id", "name", "code", "slug", "reliability")
    SELECT * FROM unnest(
      ${suppliers.map((s) => s.id)}::text[],
      ${suppliers.map((s) => s.name)}::text[],
      ${suppliers.map((s) => s.code)}::text[],
      ${suppliers.map((s) => s.slug)}::text[],
      ${suppliers.map((s) => s.reliability)}::text[]
    )
  `;
  const ib16 = suppliers.find((s) => s.code === 'IB16')!;

  // --- Client categories (mirrors "Price 1".."Price 10", Retail) ---
  const categories = withIds([
    { name: 'Retail', markupPercent: 65.65, minOrderAmount: 0, shelfLifeDays: 1 },
    { name: 'Price 1', markupPercent: 4.0, minOrderAmount: 200, shelfLifeDays: 1 },
    { name: 'Price 2', markupPercent: 5.0, minOrderAmount: 200, shelfLifeDays: 1 },
    { name: 'Price 3', markupPercent: 6.0, minOrderAmount: 200, shelfLifeDays: 1 },
    { name: 'Price 5', markupPercent: 10.0, minOrderAmount: 200, shelfLifeDays: 1 },
    { name: 'Price 9', markupPercent: 23.0, minOrderAmount: 200, shelfLifeDays: 1 },
    { name: 'Price 10', markupPercent: 26.0, minOrderAmount: 200, shelfLifeDays: 7 },
  ]);
  await run`
    INSERT INTO "ClientCategory" ("id", "name", "markupPercent", "minOrderAmount", "shelfLifeDays")
    SELECT * FROM unnest(
      ${categories.map((c) => c.id)}::text[],
      ${categories.map((c) => c.name)}::text[],
      ${categories.map((c) => c.markupPercent)}::double precision[],
      ${categories.map((c) => c.minOrderAmount)}::double precision[],
      ${categories.map((c) => c.shelfLifeDays)}::int[]
    )
  `;
  const retail = categories[0];
  const price9 = categories.find((c) => c.name === 'Price 9')!;

  // --- Accounts: one of each of the 3 roles, all with working logins ---
  const accounts = withIds([
    {
      name: 'Site Admin',
      email: 'admin@autopartshub.com',
      passwordHash: await bcrypt.hash('admin123', 10),
      role: 'ADMIN',
      city: null as string | null,
      categoryId: null as string | null,
    },
    {
      name: 'PROTOGEROS ILIAS STEFANOS',
      email: 'protogeros@example.com',
      passwordHash: await bcrypt.hash('trade123', 10),
      role: 'B2B',
      city: 'Athens' as string | null,
      categoryId: price9.id as string | null,
    },
    {
      name: 'Mohamed N.',
      email: 'walk-in@example.com',
      passwordHash: await bcrypt.hash('retail123', 10),
      role: 'RETAIL',
      city: 'Warszawa' as string | null,
      categoryId: retail.id as string | null,
    },
  ]);
  await run`
    INSERT INTO "Client" ("id", "name", "email", "passwordHash", "role", "city", "categoryId")
    SELECT * FROM unnest(
      ${accounts.map((a) => a.id)}::text[],
      ${accounts.map((a) => a.name)}::text[],
      ${accounts.map((a) => a.email)}::text[],
      ${accounts.map((a) => a.passwordHash)}::text[],
      ${accounts.map((a) => a.role)}::text[],
      ${accounts.map((a) => a.city)}::text[],
      ${accounts.map((a) => a.categoryId)}::text[]
    )
  `;

  // --- Products ---
  const system = (slug: string) => systems.find((s) => s.slug === slug)!.id;

  const products = withIds([
    {
      partNumber: '17138616418',
      name: 'Expansion Tank, coolant',
      description: 'Coolant expansion tank, OE fitment' as string | null,
      manufacturerId: brand('BMW'),
      vehicleSystemId: system('cooling-system'),
      basePrice: 42.75,
      stockDays: 8,
    },
    {
      partNumber: '25401EB30B',
      name: 'Glass lifter switch unit',
      description: null as string | null,
      manufacturerId: brand('NISSAN'),
      vehicleSystemId: system('body'),
      basePrice: 24.1,
      stockDays: 2,
    },
    {
      partNumber: '1603147030',
      name: 'Thermostat',
      description: null as string | null,
      manufacturerId: brand('TOYOTA'),
      vehicleSystemId: system('cooling-system'),
      basePrice: 52.3,
      stockDays: 1,
    },
    {
      partNumber: '2565002821',
      name: 'Thermostat and housing',
      description: null as string | null,
      manufacturerId: brand('HYUNDAI'),
      vehicleSystemId: system('cooling-system'),
      basePrice: 18.2,
      stockDays: 3,
    },
    {
      partNumber: '03302',
      name: 'Expansion tank cap',
      description: null as string | null,
      manufacturerId: brand('METALCAUCHO'),
      vehicleSystemId: system('cooling-system'),
      basePrice: 8.4,
      stockDays: 1,
    },
  ]);
  await run`
    INSERT INTO "Product" ("id", "partNumber", "name", "description", "manufacturerId",
                           "vehicleSystemId", "basePrice", "stockDays")
    SELECT * FROM unnest(
      ${products.map((p) => p.id)}::text[],
      ${products.map((p) => p.partNumber)}::text[],
      ${products.map((p) => p.name)}::text[],
      ${products.map((p) => p.description)}::text[],
      ${products.map((p) => p.manufacturerId)}::text[],
      ${products.map((p) => p.vehicleSystemId)}::text[],
      ${products.map((p) => p.basePrice)}::double precision[],
      ${products.map((p) => p.stockDays)}::int[]
    )
  `;

  // --- Complex markup rules (mirrors the "Complex markup" screen) ---
  const rules = withIds([
    {
      label: 'BMW cooling parts — Price 9 club',
      priority: 10,
      clientCategoryId: price9.id as string | null,
      supplierId: null as string | null,
      manufacturerName: 'BMW' as string | null,
      vehicleSystemSlug: 'cooling-system' as string | null,
      purchasePriceFrom: null as number | null,
      purchasePriceTo: null as number | null,
      type: 'PERCENT',
      value: 18,
    },
    {
      label: 'Low-value aftermarket parts (<€10) — flat +€2',
      priority: 5,
      clientCategoryId: null as string | null,
      supplierId: null as string | null,
      manufacturerName: null as string | null,
      vehicleSystemSlug: null as string | null,
      purchasePriceFrom: 0 as number | null,
      purchasePriceTo: 10 as number | null,
      type: 'AMOUNT',
      value: 2,
    },
    {
      label: 'IB16 supplier standing discount',
      priority: 3,
      clientCategoryId: null as string | null,
      supplierId: ib16.id as string | null,
      manufacturerName: null as string | null,
      vehicleSystemSlug: null as string | null,
      purchasePriceFrom: null as number | null,
      purchasePriceTo: null as number | null,
      type: 'PERCENT',
      value: 12,
    },
  ]);
  await run`
    INSERT INTO "MarkupRule" ("id", "label", "priority", "clientCategoryId", "supplierId",
                              "manufacturerName", "vehicleSystemSlug",
                              "purchasePriceFrom", "purchasePriceTo", "type", "value")
    SELECT * FROM unnest(
      ${rules.map((r) => r.id)}::text[],
      ${rules.map((r) => r.label)}::text[],
      ${rules.map((r) => r.priority)}::int[],
      ${rules.map((r) => r.clientCategoryId)}::text[],
      ${rules.map((r) => r.supplierId)}::text[],
      ${rules.map((r) => r.manufacturerName)}::text[],
      ${rules.map((r) => r.vehicleSystemSlug)}::text[],
      ${rules.map((r) => r.purchasePriceFrom)}::double precision[],
      ${rules.map((r) => r.purchasePriceTo)}::double precision[],
      ${rules.map((r) => r.type)}::text[],
      ${rules.map((r) => r.value)}::double precision[]
    )
  `;

  // Counted through the same runner, so under --dry it reads the uncommitted
  // rows rather than the shop that is already there.
  const counted = (
    await run<{ products: number; categories: number }>`
      SELECT (SELECT COUNT(*) FROM "Product")::int AS "products",
             (SELECT COUNT(*) FROM "ClientCategory")::int AS "categories"
    `
  )[0];

  console.log(`Seeded ${counted?.products ?? 0} products, ${counted?.categories ?? 0} client categories.`);
  console.log('Login accounts:');
  console.log('  Admin:  admin@autopartshub.com / admin123');
  console.log('  B2B:    protogeros@example.com / trade123');
  console.log('  Retail: walk-in@example.com / retail123');
  console.log('');
  console.log('Change the admin password before this database is reachable from the internet.');
}

/**
 * Checks every statement against the real schema without running any of them.
 *
 * EXPLAIN makes Postgres parse and plan the statement in full — column names,
 * types, the array casts, the foreign keys the plan has to touch — and then
 * throw the plan away. Nothing is inserted, so nothing has to be rolled back
 * and no table is locked while a live site is serving from it.
 *
 * Executing instead would be a worse test here, not a better one: this seed is
 * written for an empty database, and the first unique violation would abort
 * the transaction and hide every statement after it.
 */
function explaining(): Run {
  let checked = 0;
  const runner = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    const prefixed = Object.assign([...strings], {
      raw: [...strings.raw],
    }) as unknown as TemplateStringsArray;
    (prefixed as unknown as string[])[0] = 'EXPLAIN ' + strings[0];
    (prefixed.raw as unknown as string[])[0] = 'EXPLAIN ' + strings.raw[0];
    checked++;
    const label = (strings[0].match(/INSERT INTO "(\w+)"/) ?? ['', 'SELECT'])[1];
    return sql(prefixed, ...values).then((plan) => {
      console.log(`  ok  ${String(checked).padStart(2)}. ${label.padEnd(16)} ${plan.length} plan row(s)`);
      return [] as never;
    });
  }) as Run;
  return runner;
}

async function run() {
  if (!process.argv.includes('--dry')) return main(sql);

  console.log('--dry: planning every statement against the live schema, inserting nothing.\n');
  await main(explaining());
  console.log('\nevery statement planned. Nothing was written.');
  console.log('(the counts above read 0 because no row was inserted to count.)');
}

loadEnv();
run().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  }
);
