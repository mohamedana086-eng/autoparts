/**
 * Puts a stock count on the catalogue.
 * -------------------------------------
 * Stock is what decides whether a part can be sold, so a catalogue nobody has
 * counted cannot sell anything. This fills that in with worked demonstration
 * figures — it is not an inventory, it is what lets the shop be exercised.
 *
 * Idempotent, and safe on the deployed database: a part that already has any
 * stock row is left exactly as it is, so a count entered in the admin is never
 * reshuffled by a re-run. Pass --reset to clear the seeded counts first, which
 * is the only way this overwrites anything.
 *
 *   npm run db:stock
 *   npm run db:stock -- --reset
 *
 * The spread is deliberate rather than uniform: most parts get a healthy
 * number, some get one or two so the basket's ceiling can be reached without
 * ordering forty of something, and a few get none so "Out of stock" is
 * reachable without emptying a shelf by hand.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface WarehouseSeed {
  code: string;
  name: string;
  city: string;
  priority: number;
}

const WAREHOUSES: WarehouseSeed[] = [
  { code: 'EU1', name: 'Rotterdam', city: 'Rotterdam', priority: 10 },
  { code: 'EG1', name: 'Cairo', city: 'Cairo', priority: 5 },
];

/**
 * A stable number from a part number.
 *
 * Deterministic on purpose: the same catalogue seeds to the same counts on
 * every machine and every re-run, so a figure someone reports can be
 * reproduced. Random would make every run a different shop.
 */
function hashOf(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/** What one part should hold, and where. */
function planFor(partNumber: string): { EU1: number; EG1: number } {
  const h = hashOf(partNumber);
  const bucket = h % 10;

  // 1 in 10 out of stock, 2 in 10 down to the last few, the rest comfortable.
  if (bucket === 0) return { EU1: 0, EG1: 0 };
  if (bucket === 1) return { EU1: 1, EG1: 0 };
  if (bucket === 2) return { EU1: 2, EG1: 1 };

  // Unsigned shifts throughout. `>>` coerces to int32 first, so any hash with
  // the top bit set comes back negative, `% n` stays negative, and the count
  // lands below zero — which the CHECK constraint on StockLevel refuses, as it
  // should. `>>>` keeps the hash the unsigned value hashOf built.
  const main = 6 + ((h >>> 3) % 30); // 6–35
  const secondary = (h >>> 7) % 2 === 0 ? 0 : 1 + ((h >>> 11) % 8); // often none

  return { EU1: main, EG1: secondary };
}

async function main() {
  const reset = process.argv.includes('--reset');

  const warehouses = new Map<string, string>();
  for (const w of WAREHOUSES) {
    const row = await prisma.warehouse.upsert({
      where: { code: w.code },
      create: { ...w, active: true },
      // Only reactivates and reasserts priority; a renamed site keeps its name.
      update: { active: true, priority: w.priority },
    });
    warehouses.set(w.code, row.id);
  }
  console.log(`warehouses ready: ${WAREHOUSES.map((w) => w.code).join(', ')}`);

  if (reset) {
    const { count } = await prisma.stockLevel.deleteMany({
      where: { warehouseId: { in: [...warehouses.values()] } },
    });
    console.log(`--reset: cleared ${count} stock row${count === 1 ? '' : 's'}`);
  }

  const products = await prisma.product.findMany({
    select: { id: true, partNumber: true, _count: { select: { stock: true } } },
    orderBy: { partNumber: 'asc' },
  });

  let counted = 0;
  let skipped = 0;
  let outOfStock = 0;
  let scarce = 0;

  for (const product of products) {
    // Anything already counted is somebody's real figure. Leave it.
    if (product._count.stock > 0) {
      skipped++;
      continue;
    }

    const plan = planFor(product.partNumber);
    const total = plan.EU1 + plan.EG1;

    for (const [code, quantity] of Object.entries(plan)) {
      // A row of zero is a counted empty shelf, which is the point of the
      // out-of-stock bucket — but only write one where the plan put the part.
      if (quantity === 0 && code === 'EG1') continue;

      await prisma.stockLevel.create({
        data: {
          productId: product.id,
          warehouseId: warehouses.get(code)!,
          quantity,
          reserved: 0,
        },
      });
    }

    counted++;
    if (total === 0) outOfStock++;
    else if (total <= 3) scarce++;
  }

  console.log(`
counted ${counted} part${counted === 1 ? '' : 's'}${skipped ? `, left ${skipped} already counted alone` : ''}
  ${outOfStock} out of stock
  ${scarce} down to the last one or two
  ${counted - outOfStock - scarce} comfortably stocked
`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
