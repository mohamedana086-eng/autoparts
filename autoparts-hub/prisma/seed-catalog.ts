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
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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
  for (const [name, isOEM] of MANUFACTURERS) {
    await prisma.manufacturer.upsert({
      where: { name },
      update: {},
      create: { name, isOEM },
    });
  }

  const manufacturers = new Map(
    (await prisma.manufacturer.findMany()).map((m) => [m.name, m.id])
  );
  const systems = new Map(
    (await prisma.vehicleSystem.findMany()).map((s) => [s.slug, s.id])
  );

  // ---- products ----
  let created = 0;
  let updated = 0;

  for (const p of PRODUCTS) {
    const manufacturerId = manufacturers.get(p.manufacturer);
    const vehicleSystemId = systems.get(p.system);

    if (!manufacturerId) throw new Error(`Unknown manufacturer: ${p.manufacturer}`);
    if (!vehicleSystemId) throw new Error(`Unknown vehicle system: ${p.system}`);

    const existing = await prisma.product.findUnique({ where: { partNumber: p.partNumber } });

    await prisma.product.upsert({
      where: { partNumber: p.partNumber },
      update: {
        name: p.name,
        description: p.description ?? null,
        manufacturerId,
        vehicleSystemId,
        basePrice: p.basePrice,
        stockDays: p.stockDays,
      },
      create: {
        partNumber: p.partNumber,
        name: p.name,
        description: p.description ?? null,
        manufacturerId,
        vehicleSystemId,
        basePrice: p.basePrice,
        stockDays: p.stockDays,
      },
    });

    if (existing) updated++;
    else created++;
  }

  // ---- interchanges ----
  // Interchange has no unique constraint, so only fill in products that have
  // none yet. That keeps this re-runnable without stacking duplicates, and
  // leaves any cross-references added by hand alone.
  let interchangesAdded = 0;

  for (const [partNumber, refs] of Object.entries(INTERCHANGES)) {
    const product = await prisma.product.findUnique({
      where: { partNumber },
      include: { _count: { select: { interchanges: true } } },
    });
    if (!product || product._count.interchanges > 0) continue;

    await prisma.interchange.createMany({
      data: refs.map(([targetPartNo, targetManufacturer, exactMatch]) => ({
        sourceId: product.id,
        targetPartNo,
        targetManufacturer,
        exactMatch,
      })),
    });
    interchangesAdded += refs.length;
  }

  const totals = {
    products: await prisma.product.count(),
    manufacturers: await prisma.manufacturer.count(),
    interchanges: await prisma.interchange.count(),
  };

  console.log(`products: ${created} created, ${updated} updated`);
  console.log(`interchanges added: ${interchangesAdded}`);
  console.log(
    `catalog now: ${totals.products} products, ${totals.manufacturers} manufacturers, ${totals.interchanges} cross-references`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
