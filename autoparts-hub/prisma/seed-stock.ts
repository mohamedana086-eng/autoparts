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
import { loadEnv } from './env';
import { sql, one } from '@/lib/sql';
import { newId } from '@/lib/id';

/** Statuses where the goods have left, so the allocation no longer holds stock. */
const GONE = ['shipped', 'paid'];

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
    // Only reactivates and reasserts priority; a renamed site keeps its name.
    const row = await one<{ id: string }>`
      INSERT INTO "Warehouse" ("id", "code", "name", "city", "priority", "active")
      VALUES (${newId()}, ${w.code}, ${w.name}, ${w.city}, ${w.priority}, TRUE)
      ON CONFLICT ("code") DO UPDATE
        SET "active" = TRUE, "priority" = EXCLUDED."priority"
      RETURNING "id"
    `;
    warehouses.set(w.code, row!.id);
  }
  console.log(`warehouses ready: ${WAREHOUSES.map((w) => w.code).join(', ')}`);

  if (reset) {
    const cleared = await sql<{ id: string }>`
      DELETE FROM "StockLevel"
       WHERE "warehouseId" = ANY(${[...warehouses.values()]}::text[])
      RETURNING "id"
    `;
    const count = cleared.length;
    console.log(`--reset: cleared ${count} stock row${count === 1 ? '' : 's'}`);
  }

  /**
   * What live orders already hold, per (part, warehouse).
   *
   * Seeding used to write `reserved: 0` on every shelf it created, which threw
   * away reservations belonging to orders that were still open. The shelves
   * then disagreed with the orders, and shipping one drove `reserved` below
   * zero and was refused by the CHECK constraint — an order nobody could ever
   * ship, out of a command that looked like it only touched sample data.
   *
   * So the counts are laid on top of what is owed rather than over it.
   */
  const owed = new Map<string, number>();
  const allocations = await sql<{ productId: string; warehouseId: string; held: number }>`
    SELECT oi."productId", a."warehouseId", SUM(a."quantity")::int AS "held"
    FROM "OrderItemAllocation" a
    JOIN "OrderItem" oi ON oi."id" = a."orderItemId"
    JOIN "Order" o ON o."id" = oi."orderId"
    WHERE o."status" <> ALL(${GONE}::text[])
    GROUP BY oi."productId", a."warehouseId"
  `;
  for (const a of allocations) {
    owed.set(`${a.productId}:${a.warehouseId}`, a.held);
  }
  if (owed.size > 0) {
    console.log(`${owed.size} shelf/shelves hold stock for open orders; those reservations are kept`);
  }

  const products = await sql<{ id: string; partNumber: string; shelves: number }>`
    SELECT p."id", p."partNumber", s."count"::int AS "shelves"
    FROM "Product" p
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS "count" FROM "StockLevel" sl WHERE sl."productId" = p."id"
    ) s ON TRUE
    ORDER BY p."partNumber" ASC
  `;

  let counted = 0;
  let skipped = 0;
  let outOfStock = 0;
  let scarce = 0;

  for (const product of products) {
    // Anything already counted is somebody's real figure. Leave it.
    if (product.shelves > 0) {
      skipped++;
      continue;
    }

    const plan = planFor(product.partNumber);
    const total = plan.EU1 + plan.EG1;

    for (const [code, planned] of Object.entries(plan)) {
      const warehouseId = warehouses.get(code)!;
      const reserved = owed.get(`${product.id}:${warehouseId}`) ?? 0;

      // A row of zero is a counted empty shelf, which is the point of the
      // out-of-stock bucket — but only write one where the plan put the part,
      // or where an open order is holding units there regardless.
      if (planned === 0 && code === 'EG1' && reserved === 0) continue;

      // The shelf has to hold at least what is already promised, or the CHECK
      // constraint refuses the row outright.
      const quantity = Math.max(planned, reserved);

      // updatedAt is NOT NULL with no default: the ORM filled it in on the way
      // past, and nothing else does.
      await sql`
        INSERT INTO "StockLevel" ("id", "productId", "warehouseId", "quantity", "reserved", "updatedAt")
        VALUES (${newId()}, ${product.id}, ${warehouseId}, ${quantity}, ${reserved}, CURRENT_TIMESTAMP)
      `;
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

loadEnv();
main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  }
);
