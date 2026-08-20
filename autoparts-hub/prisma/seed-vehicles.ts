/**
 * Vehicles and fitment.
 * ---------------------
 * Idempotent: everything is upserted by its unique key, so this can be run
 * repeatedly and against a populated database. Safe on the deployed one.
 *
 *   npm run db:vehicles
 *
 * Hand-written sample data. The makes, models and engine variants are real
 * enough to demonstrate the flow, but the fitment is assigned by rule (see
 * FITS below) rather than taken from a fitment database — swap this for a
 * TecDoc/TecAlliance linkage import before anyone relies on it to order.
 */
import { loadEnv } from './env';
import { sql, one } from '@/lib/sql';
import { newId } from '@/lib/id';

interface VariantSeed {
  name: string;
  engineCode?: string;
  powerKw?: number;
  fuel: string;
  yearFrom: number;
  yearTo?: number;
}

interface ModelSeed {
  name: string;
  yearFrom: number;
  yearTo?: number;
  variants: VariantSeed[];
}

interface MakeSeed {
  name: string;
  /** First three characters of a VIN issued to this manufacturer. */
  wmiCodes: string[];
  models: ModelSeed[];
}

const MAKES: MakeSeed[] = [
  {
    name: 'BMW',
    wmiCodes: ['WBA', 'WBS', 'WBY', '4US', '5UX'],
    models: [
      {
        name: '3 Series (E90)',
        yearFrom: 2005,
        yearTo: 2012,
        variants: [
          { name: '318d 2.0', engineCode: 'N47D20', powerKw: 105, fuel: 'diesel', yearFrom: 2007, yearTo: 2012 },
          { name: '320i 2.0', engineCode: 'N46B20', powerKw: 125, fuel: 'petrol', yearFrom: 2005, yearTo: 2012 },
        ],
      },
      {
        name: '5 Series (F10)',
        yearFrom: 2010,
        yearTo: 2017,
        variants: [
          { name: '520d 2.0', engineCode: 'N47D20', powerKw: 135, fuel: 'diesel', yearFrom: 2010, yearTo: 2017 },
          { name: '530i 3.0', engineCode: 'N53B30', powerKw: 190, fuel: 'petrol', yearFrom: 2010, yearTo: 2016 },
        ],
      },
    ],
  },
  {
    name: 'VOLKSWAGEN',
    wmiCodes: ['WVW', 'WV1', 'WV2', '3VW'],
    models: [
      {
        name: 'Golf VII',
        yearFrom: 2012,
        yearTo: 2020,
        variants: [
          { name: '1.6 TDI', engineCode: 'CLHA', powerKw: 77, fuel: 'diesel', yearFrom: 2012, yearTo: 2020 },
          { name: '1.4 TSI', engineCode: 'CZCA', powerKw: 92, fuel: 'petrol', yearFrom: 2012, yearTo: 2020 },
        ],
      },
      {
        name: 'Passat B8',
        yearFrom: 2014,
        variants: [
          { name: '2.0 TDI', engineCode: 'CRLB', powerKw: 110, fuel: 'diesel', yearFrom: 2014 },
        ],
      },
    ],
  },
  {
    name: 'TOYOTA',
    wmiCodes: ['JTD', 'JTE', 'SB1', 'VNK', 'NMT'],
    models: [
      {
        name: 'Corolla (E12)',
        yearFrom: 2001,
        yearTo: 2007,
        variants: [
          { name: '1.4 D-4D', engineCode: '1ND-TV', powerKw: 66, fuel: 'diesel', yearFrom: 2002, yearTo: 2007 },
          { name: '1.6 VVT-i', engineCode: '3ZZ-FE', powerKw: 81, fuel: 'petrol', yearFrom: 2001, yearTo: 2007 },
        ],
      },
      {
        name: 'Avensis (T27)',
        yearFrom: 2008,
        yearTo: 2018,
        variants: [
          { name: '2.0 D-4D', engineCode: '1AD-FTV', powerKw: 93, fuel: 'diesel', yearFrom: 2008, yearTo: 2018 },
        ],
      },
    ],
  },
  {
    name: 'NISSAN',
    wmiCodes: ['JN1', 'JN6', 'VSK', 'SJN'],
    models: [
      {
        name: 'Qashqai (J11)',
        yearFrom: 2013,
        yearTo: 2021,
        variants: [
          { name: '1.5 dCi', engineCode: 'K9K', powerKw: 81, fuel: 'diesel', yearFrom: 2013, yearTo: 2021 },
          { name: '1.2 DIG-T', engineCode: 'HRA2DDT', powerKw: 85, fuel: 'petrol', yearFrom: 2013, yearTo: 2021 },
        ],
      },
    ],
  },
  {
    name: 'HYUNDAI',
    wmiCodes: ['KMH', 'TMA', 'NLH'],
    models: [
      {
        name: 'i30 (GD)',
        yearFrom: 2011,
        yearTo: 2017,
        variants: [
          { name: '1.6 CRDi', engineCode: 'D4FB', powerKw: 81, fuel: 'diesel', yearFrom: 2011, yearTo: 2017 },
          { name: '1.4 MPI', engineCode: 'G4FA', powerKw: 73, fuel: 'petrol', yearFrom: 2011, yearTo: 2017 },
        ],
      },
    ],
  },
  {
    name: 'MERCEDES-BENZ',
    wmiCodes: ['WDB', 'WDD', 'W1K', 'WDC'],
    models: [
      {
        name: 'C-Class (W204)',
        yearFrom: 2007,
        yearTo: 2014,
        variants: [
          { name: 'C 220 CDI', engineCode: 'OM646', powerKw: 125, fuel: 'diesel', yearFrom: 2007, yearTo: 2014 },
          { name: 'C 180 CGI', engineCode: 'M271', powerKw: 115, fuel: 'petrol', yearFrom: 2008, yearTo: 2014 },
        ],
      },
    ],
  },
];

/**
 * Which vehicles a part is offered for.
 *
 * Rules rather than a row per pairing: aftermarket service parts are listed
 * across the range, while a part carrying a vehicle maker's own brand is
 * limited to that make. `fuel` narrows the ones that only make sense on one
 * kind of engine.
 */
interface FitRule {
  /** Vehicle system slugs the rule covers. */
  systems: string[];
  /** Restrict to these makes; omitted means every make. */
  makes?: string[];
  /** Restrict to these fuels; omitted means any. */
  fuels?: string[];
  note?: string;
}

const FITS: FitRule[] = [
  { systems: ['filter'], note: 'service item' },
  { systems: ['brake-system'] },
  { systems: ['wheels'] },
  { systems: ['body'] },
  { systems: ['lights'] },
  { systems: ['electrics'] },
  { systems: ['steering'] },
  { systems: ['drive-system'] },
  { systems: ['cooling-system'] },
  { systems: ['air-conditioning'] },
  { systems: ['ignition-glow'], fuels: ['petrol'], note: 'petrol engines' },
  { systems: ['fuel-system'] },
];

/** Vehicle makers whose own-brand parts should not be offered across rivals. */
const CAR_MAKERS = new Set(['BMW', 'NISSAN', 'TOYOTA', 'HYUNDAI', 'VOLKSWAGEN', 'MERCEDES-BENZ']);

async function main() {
  // ---- makes, models, variants ----
  // Each level upserts on its unique key and returns the id the next level
  // hangs off, so a re-run updates in place rather than duplicating.
  for (const make of MAKES) {
    const makeRow = await one<{ id: string }>`
      INSERT INTO "VehicleMake" ("id", "name", "wmiCodes")
      VALUES (${newId()}, ${make.name}, ${make.wmiCodes}::text[])
      ON CONFLICT ("name") DO UPDATE SET "wmiCodes" = EXCLUDED."wmiCodes"
      RETURNING "id"
    `;

    for (const model of make.models) {
      const modelRow = await one<{ id: string }>`
        INSERT INTO "VehicleModel" ("id", "makeId", "name", "yearFrom", "yearTo")
        VALUES (${newId()}, ${makeRow!.id}, ${model.name}, ${model.yearFrom},
                ${model.yearTo ?? null})
        ON CONFLICT ("makeId", "name") DO UPDATE
          SET "yearFrom" = EXCLUDED."yearFrom", "yearTo" = EXCLUDED."yearTo"
        RETURNING "id"
      `;

      for (const variant of model.variants) {
        await sql`
          INSERT INTO "VehicleVariant" ("id", "modelId", "name", "engineCode", "powerKw",
                                        "fuel", "yearFrom", "yearTo")
          VALUES (${newId()}, ${modelRow!.id}, ${variant.name}, ${variant.engineCode ?? null},
                  ${variant.powerKw ?? null}, ${variant.fuel}, ${variant.yearFrom},
                  ${variant.yearTo ?? null})
          ON CONFLICT ("modelId", "name") DO UPDATE
            SET "engineCode" = EXCLUDED."engineCode",
                "powerKw" = EXCLUDED."powerKw",
                "fuel" = EXCLUDED."fuel",
                "yearFrom" = EXCLUDED."yearFrom",
                "yearTo" = EXCLUDED."yearTo"
        `;
      }
    }
  }

  // ---- fitment ----
  // Flat rows with the make name and system slug joined in, because that is
  // all the rules below read. The ORM returned a make nested two levels inside
  // each variant, which had to be walked once per product per rule.
  const variants = await sql<{ id: string; makeName: string; fuel: string }>`
    SELECT v."id", mk."name" AS "makeName", v."fuel"
    FROM "VehicleVariant" v
    JOIN "VehicleModel" md ON md."id" = v."modelId"
    JOIN "VehicleMake" mk ON mk."id" = md."makeId"
  `;
  const products = await sql<{ id: string; brand: string; systemSlug: string }>`
    SELECT p."id", m."name" AS "brand", vs."slug" AS "systemSlug"
    FROM "Product" p
    JOIN "Manufacturer" m ON m."id" = p."manufacturerId"
    JOIN "VehicleSystem" vs ON vs."id" = p."vehicleSystemId"
  `;

  const pairs: Array<{ productId: string; variantId: string; note: string | null }> = [];

  for (const product of products) {
    const ownBrandOf = CAR_MAKERS.has(product.brand) ? product.brand : null;

    for (const rule of FITS) {
      if (!rule.systems.includes(product.systemSlug)) continue;

      for (const variant of variants) {
        // A vehicle maker's own part only goes on its own vehicles.
        if (ownBrandOf && ownBrandOf !== variant.makeName) continue;
        if (rule.makes && !rule.makes.includes(variant.makeName)) continue;
        if (rule.fuels && !rule.fuels.includes(variant.fuel)) continue;

        pairs.push({ productId: product.id, variantId: variant.id, note: rule.note ?? null });
      }
    }
  }

  // ON CONFLICT DO NOTHING so a re-run adds only what is missing, and
  // RETURNING so it can say how many that was. Thousands of pairs go in a few
  // statements rather than a few thousand.
  const CHUNK = 5000;
  let added = 0;
  for (let at = 0; at < pairs.length; at += CHUNK) {
    const chunk = pairs.slice(at, at + CHUNK);
    const inserted = await sql<{ id: string }>`
      INSERT INTO "Fitment" ("id", "productId", "variantId", "note")
      SELECT * FROM unnest(
        ${chunk.map(() => newId())}::text[],
        ${chunk.map((p) => p.productId)}::text[],
        ${chunk.map((p) => p.variantId)}::text[],
        ${chunk.map((p) => p.note)}::text[]
      )
      ON CONFLICT ("productId", "variantId") DO NOTHING
      RETURNING "id"
    `;
    added += inserted.length;
  }

  const counts = await one<{
    makes: number; models: number; variants: number; fitments: number;
  }>`
    SELECT (SELECT COUNT(*) FROM "VehicleMake")::int AS "makes",
           (SELECT COUNT(*) FROM "VehicleModel")::int AS "models",
           (SELECT COUNT(*) FROM "VehicleVariant")::int AS "variants",
           (SELECT COUNT(*) FROM "Fitment")::int AS "fitments"
  `;

  console.log(
    `makes ${counts?.makes ?? 0}, models ${counts?.models ?? 0}, ` +
      `variants ${counts?.variants ?? 0}`
  );
  console.log(`fitment rows: ${added} added, ${counts?.fitments ?? 0} total`);
}

loadEnv();
main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  }
);
