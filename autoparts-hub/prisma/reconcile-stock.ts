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
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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

async function survey(): Promise<Drift[]> {
  // Every (part, warehouse) an order currently holds, and how much.
  const held = await prisma.orderItemAllocation.groupBy({
    by: ['warehouseId', 'orderItemId'],
    where: { orderItem: { order: { status: { notIn: GONE } } } },
    _sum: { quantity: true },
  });

  // groupBy cannot reach through orderItem to productId, so map it here.
  const items = await prisma.orderItem.findMany({
    where: { id: { in: held.map((h) => h.orderItemId) } },
    select: { id: true, productId: true, product: { select: { partNumber: true } } },
  });
  const itemById = new Map(items.map((i) => [i.id, i]));

  const owedBy = new Map<string, { productId: string; partNumber: string; warehouseId: string; owed: number }>();
  for (const row of held) {
    const item = itemById.get(row.orderItemId);
    if (!item) continue;
    const key = `${item.productId}:${row.warehouseId}`;
    const previous = owedBy.get(key);
    const owed = (previous?.owed ?? 0) + (row._sum.quantity ?? 0);
    owedBy.set(key, {
      productId: item.productId,
      partNumber: item.product.partNumber,
      warehouseId: row.warehouseId,
      owed,
    });
  }

  const warehouses = new Map(
    (await prisma.warehouse.findMany({ select: { id: true, code: true } })).map((w) => [w.id, w.code])
  );

  const drifts: Drift[] = [];

  for (const entry of owedBy.values()) {
    const shelf = await prisma.stockLevel.findUnique({
      where: { productId_warehouseId: { productId: entry.productId, warehouseId: entry.warehouseId } },
    });
    if (shelf?.reserved === entry.owed) continue;

    drifts.push({
      ...entry,
      warehouseCode: warehouses.get(entry.warehouseId) ?? entry.warehouseId,
      storedReserved: shelf?.reserved ?? null,
      quantity: shelf?.quantity ?? null,
    });
  }

  // The other direction: a shelf reserving units no live order is holding.
  const shelves = await prisma.stockLevel.findMany({
    where: { reserved: { gt: 0 } },
    include: { product: { select: { partNumber: true } }, warehouse: { select: { code: true } } },
  });
  for (const shelf of shelves) {
    const key = `${shelf.productId}:${shelf.warehouseId}`;
    if (owedBy.has(key)) continue; // already covered above
    drifts.push({
      productId: shelf.productId,
      partNumber: shelf.product.partNumber,
      warehouseId: shelf.warehouseId,
      warehouseCode: shelf.warehouse.code,
      storedReserved: shelf.reserved,
      quantity: shelf.quantity,
      owed: 0,
    });
  }

  return drifts;
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

    await prisma.stockLevel.upsert({
      where: { productId_warehouseId: { productId: d.productId, warehouseId: d.warehouseId } },
      create: {
        productId: d.productId,
        warehouseId: d.warehouseId,
        quantity,
        reserved: d.owed,
      },
      update: { quantity, reserved: d.owed },
    });

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

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
