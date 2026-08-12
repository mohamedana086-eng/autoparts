import 'server-only';
import type { Prisma } from '@prisma/client';

/**
 * Moving stock as orders move.
 *
 * Two facts, kept apart, as StockLevel describes them: `quantity` is what is
 * on the shelf and `reserved` is what is promised. Placing an order raises
 * `reserved` and leaves `quantity` alone — the goods have not gone anywhere
 * yet. Shipping lowers both, because that is the moment they leave.
 *
 * The rule that decides everything else here: a part with no stock row is
 * UNTRACKED, not out of stock. Nobody has counted it into a warehouse, so
 * there is no number to hold it to, and it sells on `Product.stockDays` the
 * way the whole catalogue did before warehouses existed. Reading an absent row
 * as zero would take every part nobody has counted yet off sale — which today
 * is all of them. Out of stock is a thing you can only be once someone has
 * looked at the shelf.
 */

/** What one order line needs. */
export interface StockNeed {
  productId: string;
  quantity: number;
}

/** Where one line's stock was found. */
export interface Allocation {
  productId: string;
  warehouseId: string;
  quantity: number;
}

export interface Shortfall {
  productId: string;
  wanted: number;
  available: number;
}

export type ReserveResult =
  | { ok: true; allocations: Allocation[] }
  | { ok: false; shortfall: Shortfall };

interface AvailableRow {
  id: string;
  warehouseId: string;
  available: number;
}

/**
 * Holds stock for an order, inside the caller's transaction.
 *
 * Must be called within `prisma.$transaction` — the row locks it takes are
 * what stop two customers being sold the same last unit, and they last until
 * that transaction ends. Called outside one, each statement commits on its own
 * and the locks are released immediately, which is the oversell this exists to
 * prevent.
 *
 * Warehouses are drawn in `priority` order, highest first, which is what the
 * column is for. A line that one site cannot fill alone is split across the
 * next ones rather than refused.
 */
export async function reserveStock(
  tx: Prisma.TransactionClient,
  needs: StockNeed[]
): Promise<ReserveResult> {
  const allocations: Allocation[] = [];

  for (const need of needs) {
    // FOR UPDATE OF s locks the stock rows for the rest of the transaction, so
    // the availability read below cannot go stale between here and the write.
    // Only StockLevel is locked; the warehouse rows are read, not claimed.
    const rows = await tx.$queryRaw<AvailableRow[]>`
      SELECT s."id", s."warehouseId", s."quantity" - s."reserved" AS available
      FROM "StockLevel" s
      JOIN "Warehouse" w ON w."id" = s."warehouseId"
      WHERE s."productId" = ${need.productId}
        AND w."active" = true
      ORDER BY w."priority" DESC, w."code" ASC
      FOR UPDATE OF s
    `;

    // Untracked — see the rule at the top of this file. Nothing to reserve and
    // nothing to refuse.
    if (rows.length === 0) continue;

    const available = rows.reduce((sum, r) => sum + Number(r.available), 0);
    if (available < need.quantity) {
      return {
        ok: false,
        shortfall: { productId: need.productId, wanted: need.quantity, available },
      };
    }

    let outstanding = need.quantity;
    for (const row of rows) {
      if (outstanding === 0) break;

      const take = Math.min(outstanding, Number(row.available));
      if (take <= 0) continue;

      await tx.stockLevel.update({
        where: { id: row.id },
        data: { reserved: { increment: take } },
      });

      allocations.push({ productId: need.productId, warehouseId: row.warehouseId, quantity: take });
      outstanding -= take;
    }
  }

  return { ok: true, allocations };
}

/**
 * Applies a change of order status to the shelves it drew on.
 *
 * Shipping is the moment goods leave: both `quantity` and `reserved` come
 * down by what was held, which keeps the promise and the shelf consistent —
 * dropping only one would leave either phantom stock or a permanent promise
 * against it.
 *
 * Reversing a status set by mistake puts both back. Both move together in
 * either direction, so `reserved <= quantity` holds throughout and the
 * check constraint never has to catch us.
 *
 * Idempotent by construction: it is driven by whether the order crossed into
 * or out of `shipped`, not by what it was set to, so saving `shipped` twice
 * moves nothing the second time.
 */
export async function applyShipmentChange(
  tx: Prisma.TransactionClient,
  orderId: string,
  wasShipped: boolean,
  isShipped: boolean
): Promise<void> {
  if (wasShipped === isShipped) return;

  const allocations = await tx.orderItemAllocation.findMany({
    where: { orderItem: { orderId } },
    select: { warehouseId: true, quantity: true, orderItem: { select: { productId: true } } },
  });

  for (const a of allocations) {
    const delta = isShipped ? -a.quantity : a.quantity;

    await tx.stockLevel.updateMany({
      where: { productId: a.orderItem.productId, warehouseId: a.warehouseId },
      data: { quantity: { increment: delta }, reserved: { increment: delta } },
    });
  }
}
