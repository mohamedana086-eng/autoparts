/**
 * Checks that what the shelves say is reserved matches what orders actually hold.
 * ------------------------------------------------------------------------------
 * `StockLevel.reserved` is a stored copy of something derivable: the units that
 * live orders hold against that shelf, which is exactly the sum of their
 * `OrderItemAllocation` rows. Storing it makes availability one cheap read
 * instead of a join per part — and makes it possible for the two to disagree.
 *
 * Three things pull them apart, and none of them is exotic:
 *   - the admin stock editor takes `reserved` as a free number
 *   - deleting a shelf from that editor leaves an order's allocation behind
 *   - re-seeding stock rewrites the shelves without consulting the orders
 *
 * Once they disagree, shipping the order fails: releasing more than the shelf
 * says is reserved drives the column below zero and the CHECK constraint
 * refuses the whole transaction. The order becomes unshippable and the admin
 * sees a database error.
 *
 *   npm run db:reconcile          report only
 *   npm run db:reconcile -- --fix repair
 *
 * Repair sets `reserved` to what the orders hold. Where a shelf holds fewer
 * units than its orders were promised, `quantity` is raised to cover them and
 * every such raise is printed — those units were committed to a customer, and
 * the alternative is an order nobody can ever ship.
 */
import { loadEnv } from './env';
import { sql } from '@/lib/sql';
import { newId } from '@/lib/id';

/** Statuses where the goods have left, so the allocation no longer holds stock. */
const GONE = ['shipped', 'paid'];

interface Drift {
  productId: string;
  partNumber: string;
  warehouseId: string;
  warehouseCode: string;
  /** Null when no shelf exists for a part orders still hold at that site. */
  storedReserved: number | null;
  quantity: number | null;
  owed: number;
}

/**
 * Every (part, warehouse) where the shelf and the orders disagree.
 *
 * A full outer join, because the disagreement runs both ways: an order can
 * hold units at a site with no shelf at all, and a shelf can reserve units no
 * live order is holding. Either side may be the one that is missing, so
 * neither can be the one driving the join.
 *
 * This used to be four queries and two maps built in memory — allocations
 * grouped, order items looked up to reach their product, warehouses fetched
 * for their codes, and then one shelf read per candidate. It is the question
 * asked once now.
 */
async function survey(): Promise<Drift[]> {
  return sql<Drift>`
    WITH held AS (
      SELECT oi."productId", a."warehouseId", SUM(a."quantity")::int AS "owed"
      FROM "OrderItemAllocation" a
      JOIN "OrderItem" oi ON oi."id" = a."orderItemId"
      JOIN "Order" o ON o."id" = oi."orderId"
      WHERE o."status" <> ALL(${GONE}::text[])
      GROUP BY oi."productId", a."warehouseId"
    )
    SELECT COALESCE(h."productId", s."productId") AS "productId",
           p."partNumber",
           COALESCE(h."warehouseId", s."warehouseId") AS "warehouseId",
           w."code" AS "warehouseCode",
           s."reserved" AS "storedReserved",
           s."quantity",
           COALESCE(h."owed", 0) AS "owed"
    FROM held h
    FULL OUTER JOIN "StockLevel" s
      ON s."productId" = h."productId" AND s."warehouseId" = h."warehouseId"
    JOIN "Product" p ON p."id" = COALESCE(h."productId", s."productId")
    JOIN "Warehouse" w ON w."id" = COALESCE(h."warehouseId", s."warehouseId")
    -- -1 stands for "there is no shelf", which can never equal a real total
    -- and so always counts as a disagreement. A shelf reserving nothing that
    -- no order holds agrees, and drops out here.
    WHERE COALESCE(s."reserved", -1) <> COALESCE(h."owed", 0)
    ORDER BY p."partNumber" ASC, w."code" ASC
  `;
}

async function main() {
  const fix = process.argv.includes('--fix');
  const drifts = await survey();

  if (drifts.length === 0) {
    console.log('Every shelf agrees with the orders holding it. Nothing to do.');
    return;
  }

  console.log(`${drifts.length} shelf/shelves disagree with the orders holding them:\n`);
  for (const d of drifts) {
    const stored = d.storedReserved === null ? 'no shelf' : `reserved ${d.storedReserved}`;
    console.log(
      `  ${d.partNumber.padEnd(18)} @ ${d.warehouseCode.padEnd(5)} ${stored.padEnd(14)} orders hold ${d.owed}`
    );
  }

  if (!fix) {
    console.log('\nRun again with --fix to bring the shelves into line.');
    return;
  }

  console.log('\nrepairing:');
  const raised: string[] = [];

  for (const d of drifts) {
    // A shelf that holds fewer than its orders were promised has to grow to
    // cover them: reserved may not exceed quantity, and the units are already
    // owed to a customer. Reported, never silent.
    const quantity = Math.max(d.quantity ?? 0, d.owed);
    if (d.quantity !== null && quantity > d.quantity) {
      raised.push(`${d.partNumber} @ ${d.warehouseCode}: ${d.quantity} -> ${quantity}`);
    }

    await sql`
      INSERT INTO "StockLevel" ("id", "productId", "warehouseId", "quantity", "reserved", "updatedAt")
      VALUES (${newId()}, ${d.productId}, ${d.warehouseId}, ${quantity}, ${d.owed}, CURRENT_TIMESTAMP)
      ON CONFLICT ("productId", "warehouseId")
      DO UPDATE SET "quantity" = EXCLUDED."quantity",
                    "reserved" = EXCLUDED."reserved",
                    "updatedAt" = CURRENT_TIMESTAMP
    `;

    console.log(`  ${d.partNumber.padEnd(18)} @ ${d.warehouseCode.padEnd(5)} reserved -> ${d.owed}, quantity -> ${quantity}`);
  }

  if (raised.length > 0) {
    console.log('\nshelves raised to cover units already promised to customers:');
    for (const r of raised) console.log('  ' + r);
    console.log('  Check these against what is physically there.');
  }

  const left = await survey();
  console.log(`\n${left.length === 0 ? 'All shelves now agree.' : `${left.length} still disagree — look again.`}`);
}

loadEnv();
main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  }
);
