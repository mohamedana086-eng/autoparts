/**
 * Additional catalog data.
 * ------------------------
 * Idempotent on purpose: everything is upserted by its unique key, so this
 * can be run repeatedly, and against an already-populated database, without
 * duplicating rows or disturbing what is already there. Safe to run on the
 * deployed database.
 *
 *   npm run db:catalog
 *
 * This is still hand-written sample data, not a supplier feed — the part
 * numbers follow each brand's usual format but are not guaranteed to match
 * a real catalogue. Replace this with a TecDoc/TecAlliance import when you
 * connect real inventory.
 */
import { loadEnv } from './env';
import { sql, one } from '@/lib/sql';
import { newId } from '@/lib/id';

/** [name, isOEM] — isOEM marks a vehicle maker's own brand, matching the
 *  existing seed where METALCAUCHO (aftermarket) is false. */
const MANUFACTURERS: Array<[string, boolean]> = [
  ['BOSCH', false],
  ['VALEO', false],
  ['SACHS', false],
  ['MANN-FILTER', false],
  ['MAHLE', false],
  ['NGK', false],
  ['DENSO', false],
  ['BREMBO', false],
  ['TRW', false],
  ['ATE', false],
  ['LUK', false],
  ['SKF', false],
  ['HELLA', false],
  ['GATES', false],
  ['FEBI BILSTEIN', false],
  ['OSRAM', false],
  ['PHILIPS', false],
];

interface ProductSeed {
  partNumber: string;
  name: string;
  manufacturer: string;
  system: string;
  basePrice: number;
  stockDays: number;
  description?: string;
}

const PRODUCTS: ProductSeed[] = [
  // ---------- Brake system ----------
  { partNumber: 'P 06 020', name: 'Brake pad set, front', manufacturer: 'BREMBO', system: 'brake-system', basePrice: 38.40, stockDays: 2, description: 'Low-dust ceramic compound, includes wear sensor clips.' },
  { partNumber: '09.9772.11', name: 'Brake disc, front vented', manufacturer: 'BREMBO', system: 'brake-system', basePrice: 52.10, stockDays: 3, description: 'High-carbon cast iron, UV-coated against corrosion.' },
  { partNumber: 'GDB1330', name: 'Brake pad set, rear', manufacturer: 'TRW', system: 'brake-system', basePrice: 29.75, stockDays: 1 },
  { partNumber: 'DF4293', name: 'Brake disc, rear', manufacturer: 'TRW', system: 'brake-system', basePrice: 41.20, stockDays: 4 },
  { partNumber: '0 986 424 815', name: 'Brake pad set, front', manufacturer: 'BOSCH', system: 'brake-system', basePrice: 33.90, stockDays: 1 },
  { partNumber: '22147', name: 'Brake pad wear sensor, front', manufacturer: 'FEBI BILSTEIN', system: 'brake-system', basePrice: 6.80, stockDays: 1 },
  { partNumber: '24.5219-0713.3', name: 'Brake caliper, front left', manufacturer: 'ATE', system: 'brake-system', basePrice: 118.50, stockDays: 7, description: 'Remanufactured, supplied with carrier and guide pins.' },
  { partNumber: '33827', name: 'Brake hose, front', manufacturer: 'FEBI BILSTEIN', system: 'brake-system', basePrice: 11.25, stockDays: 2 },

  // ---------- Drive system ----------
  { partNumber: '624 3089 09', name: 'Clutch kit, 3-piece', manufacturer: 'LUK', system: 'drive-system', basePrice: 214.60, stockDays: 5, description: 'Cover, disc and release bearing matched as a set.' },
  { partNumber: '3000 970 065', name: 'Clutch kit', manufacturer: 'SACHS', system: 'drive-system', basePrice: 198.30, stockDays: 6 },
  { partNumber: 'VKJA 5402', name: 'CV joint kit, front wheel side', manufacturer: 'SKF', system: 'drive-system', basePrice: 64.90, stockDays: 3, description: 'Includes boot, grease and clamps.' },
  { partNumber: '21075', name: 'Gearbox mount', manufacturer: 'FEBI BILSTEIN', system: 'drive-system', basePrice: 24.15, stockDays: 2 },
  { partNumber: '3151 000 388', name: 'Clutch release bearing', manufacturer: 'SACHS', system: 'drive-system', basePrice: 38.70, stockDays: 3 },

  // ---------- Steering ----------
  { partNumber: 'JTE196', name: 'Tie rod end, front axle', manufacturer: 'TRW', system: 'steering', basePrice: 17.40, stockDays: 1 },
  { partNumber: 'JRA487', name: 'Steering rack', manufacturer: 'TRW', system: 'steering', basePrice: 289.00, stockDays: 10, description: 'Remanufactured hydraulic rack, exchange unit.' },
  { partNumber: 'K S00 000 495', name: 'Power steering pump', manufacturer: 'BOSCH', system: 'steering', basePrice: 176.25, stockDays: 8 },
  { partNumber: '26008', name: 'Steering column bearing', manufacturer: 'FEBI BILSTEIN', system: 'steering', basePrice: 12.60, stockDays: 4 },

  // ---------- Wheels ----------
  { partNumber: 'VKBA 3549', name: 'Wheel bearing kit, front', manufacturer: 'SKF', system: 'wheels', basePrice: 46.80, stockDays: 2 },
  { partNumber: 'VKBA 6543', name: 'Wheel bearing kit, rear', manufacturer: 'SKF', system: 'wheels', basePrice: 39.20, stockDays: 3 },
  { partNumber: '46560', name: 'Wheel hub, front axle', manufacturer: 'FEBI BILSTEIN', system: 'wheels', basePrice: 58.40, stockDays: 5 },
  { partNumber: '175012', name: 'Wheel stud set', manufacturer: 'FEBI BILSTEIN', system: 'wheels', basePrice: 4.30, stockDays: 1 },

  // ---------- Filter ----------
  { partNumber: 'W 712/75', name: 'Oil filter', manufacturer: 'MANN-FILTER', system: 'filter', basePrice: 6.15, stockDays: 1 },
  { partNumber: 'C 27 009', name: 'Air filter', manufacturer: 'MANN-FILTER', system: 'filter', basePrice: 14.70, stockDays: 1 },
  { partNumber: 'CU 2939', name: 'Cabin filter, activated carbon', manufacturer: 'MANN-FILTER', system: 'filter', basePrice: 18.90, stockDays: 2 },
  { partNumber: 'OX 371D', name: 'Oil filter', manufacturer: 'MAHLE', system: 'filter', basePrice: 7.40, stockDays: 1 },
  { partNumber: 'F 026 402 809', name: 'Fuel filter', manufacturer: 'BOSCH', system: 'filter', basePrice: 21.30, stockDays: 2 },
  { partNumber: 'LA 230', name: 'Cabin filter', manufacturer: 'MAHLE', system: 'filter', basePrice: 11.85, stockDays: 1 },

  // ---------- Cooling system ----------
  { partNumber: '732800', name: 'Radiator, engine cooling', manufacturer: 'VALEO', system: 'cooling-system', basePrice: 148.60, stockDays: 6 },
  { partNumber: 'WP0087', name: 'Water pump', manufacturer: 'GATES', system: 'cooling-system', basePrice: 54.25, stockDays: 3, description: 'Supplied with gasket and mounting hardware.' },
  { partNumber: '8EW 351 043-191', name: 'Radiator fan', manufacturer: 'HELLA', system: 'cooling-system', basePrice: 96.40, stockDays: 7 },
  { partNumber: '5488', name: 'Radiator hose, upper', manufacturer: 'GATES', system: 'cooling-system', basePrice: 16.75, stockDays: 2 },

  // ---------- Ignition and glow ----------
  { partNumber: '6418', name: 'Spark plug set (4 pieces)', manufacturer: 'NGK', system: 'ignition-glow', basePrice: 22.80, stockDays: 1, description: 'BKR6EK twin-electrode, pre-gapped.' },
  { partNumber: '48003', name: 'Ignition coil', manufacturer: 'NGK', system: 'ignition-glow', basePrice: 43.60, stockDays: 3 },
  { partNumber: '0 986 221 024', name: 'Ignition coil', manufacturer: 'BOSCH', system: 'ignition-glow', basePrice: 47.90, stockDays: 2 },
  { partNumber: '5906', name: 'Glow plug', manufacturer: 'NGK', system: 'ignition-glow', basePrice: 9.45, stockDays: 1 },
  { partNumber: 'DG-192', name: 'Glow plug set', manufacturer: 'DENSO', system: 'ignition-glow', basePrice: 34.20, stockDays: 4 },

  // ---------- Fuel system ----------
  { partNumber: '0 580 314 090', name: 'Fuel pump, in-tank', manufacturer: 'BOSCH', system: 'fuel-system', basePrice: 92.70, stockDays: 5 },
  { partNumber: 'DCRI107780', name: 'Diesel injector', manufacturer: 'DENSO', system: 'fuel-system', basePrice: 168.40, stockDays: 9, description: 'Remanufactured common-rail injector, exchange unit.' },
  { partNumber: '0 280 156 327', name: 'Petrol injector', manufacturer: 'BOSCH', system: 'fuel-system', basePrice: 74.15, stockDays: 4 },
  { partNumber: '347307', name: 'Fuel pump module', manufacturer: 'VALEO', system: 'fuel-system', basePrice: 131.20, stockDays: 7 },
  { partNumber: '100764', name: 'Fuel pressure regulator', manufacturer: 'FEBI BILSTEIN', system: 'fuel-system', basePrice: 28.60, stockDays: 3 },

  // ---------- Air conditioning ----------
  { partNumber: 'DCP32006', name: 'A/C compressor', manufacturer: 'DENSO', system: 'air-conditioning', basePrice: 289.50, stockDays: 8, description: 'Supplied without oil charge — fill to vehicle spec on fitting.' },
  { partNumber: '817777', name: 'A/C condenser', manufacturer: 'VALEO', system: 'air-conditioning', basePrice: 118.30, stockDays: 6 },
  { partNumber: 'ACP 34 000S', name: 'A/C compressor', manufacturer: 'MAHLE', system: 'air-conditioning', basePrice: 264.80, stockDays: 9 },
  { partNumber: '8FT 351 198-021', name: 'Receiver drier', manufacturer: 'HELLA', system: 'air-conditioning', basePrice: 22.40, stockDays: 3 },

  // ---------- Electrics ----------
  { partNumber: '0 124 525 035', name: 'Alternator, 140A', manufacturer: 'BOSCH', system: 'electrics', basePrice: 218.60, stockDays: 7, description: 'Remanufactured, exchange unit — old unit returnable.' },
  { partNumber: '0 001 109 015', name: 'Starter motor', manufacturer: 'BOSCH', system: 'electrics', basePrice: 176.40, stockDays: 6 },
  { partNumber: '438588', name: 'Alternator', manufacturer: 'VALEO', system: 'electrics', basePrice: 196.75, stockDays: 8 },
  { partNumber: '4RA 007 793-041', name: 'Relay, main current', manufacturer: 'HELLA', system: 'electrics', basePrice: 5.90, stockDays: 1 },
  { partNumber: '45806', name: 'Crankshaft position sensor', manufacturer: 'FEBI BILSTEIN', system: 'electrics', basePrice: 26.30, stockDays: 2 },

  // ---------- Lights ----------
  { partNumber: '1EL 354 833-021', name: 'Headlight, left', manufacturer: 'HELLA', system: 'lights', basePrice: 214.90, stockDays: 9 },
  { partNumber: '2SD 012 456-011', name: 'Tail light, right', manufacturer: 'HELLA', system: 'lights', basePrice: 96.20, stockDays: 6 },
  { partNumber: '64193', name: 'Bulb, headlight H7 55W', manufacturer: 'OSRAM', system: 'lights', basePrice: 4.85, stockDays: 1 },
  { partNumber: '12972PRC2', name: 'Bulb set, H7 (2 pieces)', manufacturer: 'PHILIPS', system: 'lights', basePrice: 9.60, stockDays: 1 },
  { partNumber: '088965', name: 'Fog light, front left', manufacturer: 'VALEO', system: 'lights', basePrice: 68.40, stockDays: 5 },

  // ---------- Body ----------
  { partNumber: '3 397 007 620', name: 'Wiper blade set, 600/450 mm', manufacturer: 'BOSCH', system: 'body', basePrice: 24.70, stockDays: 1 },
  { partNumber: '574661', name: 'Wiper blade', manufacturer: 'VALEO', system: 'body', basePrice: 13.20, stockDays: 1 },
  { partNumber: '27729', name: 'Door handle, front left', manufacturer: 'FEBI BILSTEIN', system: 'body', basePrice: 32.10, stockDays: 4 },
  { partNumber: '05541', name: 'Bonnet gas strut', manufacturer: 'METALCAUCHO', system: 'body', basePrice: 18.95, stockDays: 2 },
];

/**
 * sourcePartNumber -> the vehicle maker's own numbers for the same part.
 *
 * Separate from INTERCHANGES below because these answer a different question.
 * Those are "which other brand's part fits instead"; these are "which number
 * is printed on the dealer invoice", which is what a customer holding one
 * searches. They are written with isOEM set, so the search can tell the two
 * apart without guessing from the brand name.
 *
 * Sample data, like the rest of this file — the numbers follow each maker's
 * format but are not guaranteed to match a real parts catalogue.
 */
const OE_REFERENCES: Record<string, Array<[string, string]>> = {
  'P 06 020': [['34 11 6 794 917', 'BMW']],
  '0 986 424 815': [['34 11 6 794 917', 'BMW']],
  'GDB1330': [['34 11 6 794 917', 'BMW']],
  '09.9772.11': [['34 11 6 855 000', 'BMW']],
  'W 712/75': [['11 42 7 953 129', 'BMW']],
  '6418': [['12 12 0 037 244', 'BMW']],
  'VKBA 3549': [['40210-4M400', 'NISSAN']],
  'DCP32006': [['88310-05070', 'TOYOTA']],
  '0 124 525 035': [['37300-2B100', 'HYUNDAI']],
};

/** sourcePartNumber -> cross references [partNumber, manufacturer, exactMatch] */
const INTERCHANGES: Record<string, Array<[string, string, boolean]>> = {
  '17138616418': [
    ['03302', 'METALCAUCHO', false],
    ['376789-374', 'NISSENS', true],
  ],
  '1603147030': [
    ['TH6588.82J', 'GATES', true],
    ['DTM82951', 'DENSO', false],
  ],
  'P 06 020': [
    ['GDB1330', 'TRW', true],
    ['0 986 424 815', 'BOSCH', true],
    ['13.0460-5776.2', 'ATE', false],
  ],
  '09.9772.11': [
    ['DF4293', 'TRW', false],
    ['24.0122-0159.1', 'ATE', true],
  ],
  'W 712/75': [
    ['OX 371D', 'MAHLE', true],
    ['F 026 407 006', 'BOSCH', true],
  ],
  '6418': [
    ['ZFR6F-11', 'NGK', false],
    ['0 242 236 562', 'BOSCH', true],
  ],
  '0 124 525 035': [
    ['438588', 'VALEO', false],
    ['DAN1120', 'DENSO', true],
  ],
  'VKBA 3549': [
    ['713 6104 30', 'FAG', true],
    ['201045', 'FEBI BILSTEIN', false],
  ],
  'DCP32006': [
    ['ACP 34 000S', 'MAHLE', false],
    ['813141', 'VALEO', true],
  ],
  '732800': [
    ['376789-374', 'NISSENS', true],
    ['CR 1084 000S', 'MAHLE', false],
  ],
  '3 397 007 620': [
    ['574661', 'VALEO', false],
    ['VAL576103', 'VALEO', true],
  ],
  '0 580 314 090': [
    ['347307', 'VALEO', false],
    ['DFP-0102', 'DENSO', true],
  ],
};

async function main() {
  // ---- manufacturers ----
  // DO NOTHING, not DO UPDATE: `isOEM` is only ever asserted on insert, which
  // is what the ORM's empty `update: {}` meant.
  await sql`
    INSERT INTO "Manufacturer" ("id", "name", "isOEM")
    SELECT * FROM unnest(
      ${MANUFACTURERS.map(() => newId())}::text[],
      ${MANUFACTURERS.map(([name]) => name)}::text[],
      ${MANUFACTURERS.map(([, isOEM]) => isOEM)}::boolean[]
    )
    ON CONFLICT ("name") DO NOTHING
  `;

  const manufacturers = new Map(
    (await sql<{ name: string; id: string }>`SELECT "name", "id" FROM "Manufacturer"`).map(
      (m) => [m.name, m.id] as const
    )
  );
  const systems = new Map(
    (await sql<{ slug: string; id: string }>`SELECT "slug", "id" FROM "VehicleSystem"`).map(
      (s) => [s.slug, s.id] as const
    )
  );

  // ---- products ----
  for (const p of PRODUCTS) {
    if (!manufacturers.get(p.manufacturer)) {
      throw new Error(`Unknown manufacturer: ${p.manufacturer}`);
    }
    if (!systems.get(p.system)) throw new Error(`Unknown vehicle system: ${p.system}`);
  }

  // One statement for the whole list, and `xmax = 0` to tell an insert from an
  // update — Postgres leaves the inserting transaction id at zero on a fresh
  // row, so the same RETURNING that hands back the rows also says which were
  // new. The ORM needed a lookup per part to answer that.
  const written = await sql<{ partNumber: string; inserted: boolean }>`
    INSERT INTO "Product" ("id", "partNumber", "name", "description", "manufacturerId",
                           "vehicleSystemId", "basePrice", "stockDays")
    SELECT * FROM unnest(
      ${PRODUCTS.map(() => newId())}::text[],
      ${PRODUCTS.map((p) => p.partNumber)}::text[],
      ${PRODUCTS.map((p) => p.name)}::text[],
      ${PRODUCTS.map((p) => p.description ?? null)}::text[],
      ${PRODUCTS.map((p) => manufacturers.get(p.manufacturer)!)}::text[],
      ${PRODUCTS.map((p) => systems.get(p.system)!)}::text[],
      ${PRODUCTS.map((p) => p.basePrice)}::double precision[],
      ${PRODUCTS.map((p) => p.stockDays)}::int[]
    )
    ON CONFLICT ("partNumber") DO UPDATE
      SET "name" = EXCLUDED."name",
          "description" = EXCLUDED."description",
          "manufacturerId" = EXCLUDED."manufacturerId",
          "vehicleSystemId" = EXCLUDED."vehicleSystemId",
          "basePrice" = EXCLUDED."basePrice",
          "stockDays" = EXCLUDED."stockDays"
    RETURNING "partNumber", ("xmax" = 0) AS "inserted"
  `;

  const created = written.filter((r) => r.inserted).length;
  const updated = written.length - created;

  // ---- interchanges ----
  // Interchange has no unique constraint, so only fill in products that have
  // none yet. That keeps this re-runnable without stacking duplicates, and
  // leaves any cross-references added by hand alone.
  let interchangesAdded = 0;

  // Every part number in one lookup, with how many cross-references it already
  // carries, rather than a query per entry.
  const carrying = new Map(
    (
      await sql<{ partNumber: string; id: string; refs: number }>`
        SELECT p."partNumber", p."id", n."count"::int AS "refs"
        FROM "Product" p
        LEFT JOIN LATERAL (
          SELECT COUNT(*) AS "count" FROM "Interchange" i WHERE i."sourceId" = p."id"
        ) n ON TRUE
      `
    ).map((r) => [r.partNumber, r] as const)
  );

  const fresh: Array<[string, string, string, boolean]> = [];
  for (const [partNumber, refs] of Object.entries(INTERCHANGES)) {
    const product = carrying.get(partNumber);
    if (!product || product.refs > 0) continue;
    for (const [targetPartNo, targetManufacturer, exactMatch] of refs) {
      fresh.push([product.id, targetPartNo, targetManufacturer, exactMatch]);
    }
  }

  if (fresh.length > 0) {
    await sql`
      INSERT INTO "Interchange" ("id", "sourceId", "targetPartNo", "targetManufacturer", "exactMatch")
      SELECT * FROM unnest(
        ${fresh.map(() => newId())}::text[],
        ${fresh.map((r) => r[0])}::text[],
        ${fresh.map((r) => r[1])}::text[],
        ${fresh.map((r) => r[2])}::text[],
        ${fresh.map((r) => r[3])}::boolean[]
      )
    `;
    interchangesAdded += fresh.length;
  }

  // Checked pair by pair rather than skipping a product that already has
  // cross-references: these were added after the block above, so every seeded
  // product already has some, and a whole-product guard would never let an OE
  // number in. Interchange has no unique constraint to lean on, so the
  // NOT EXISTS does the same job in the statement instead of a query per pair.
  const oe: Array<[string, string, string]> = [];
  for (const [partNumber, refs] of Object.entries(OE_REFERENCES)) {
    const product = carrying.get(partNumber);
    if (!product) continue;
    for (const [targetPartNo, targetManufacturer] of refs) {
      oe.push([product.id, targetPartNo, targetManufacturer]);
    }
  }

  if (oe.length > 0) {
    const added = await sql<{ id: string }>`
      INSERT INTO "Interchange" ("id", "sourceId", "targetPartNo", "targetManufacturer",
                                 "exactMatch", "isOEM")
      SELECT w."id", w."sourceId", w."targetPartNo", w."targetManufacturer", TRUE, TRUE
      FROM unnest(
        ${oe.map(() => newId())}::text[],
        ${oe.map((r) => r[0])}::text[],
        ${oe.map((r) => r[1])}::text[],
        ${oe.map((r) => r[2])}::text[]
      ) AS w("id", "sourceId", "targetPartNo", "targetManufacturer")
      WHERE NOT EXISTS (
        SELECT 1 FROM "Interchange" i
        WHERE i."sourceId" = w."sourceId" AND i."targetPartNo" = w."targetPartNo"
      )
      RETURNING "id"
    `;
    interchangesAdded += added.length;
  }

  const totals = (await one<{ products: number; manufacturers: number; interchanges: number }>`
    SELECT (SELECT COUNT(*) FROM "Product")::int AS "products",
           (SELECT COUNT(*) FROM "Manufacturer")::int AS "manufacturers",
           (SELECT COUNT(*) FROM "Interchange")::int AS "interchanges"
  `)!;

  console.log(`products: ${created} created, ${updated} updated`);
  console.log(`interchanges added: ${interchangesAdded}`);
  console.log(
    `catalog now: ${totals.products} products, ${totals.manufacturers} manufacturers, ${totals.interchanges} cross-references`
  );
}

loadEnv();
main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  }
);
