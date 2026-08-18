import 'server-only';
import type { Tx } from '@/lib/sql';

/**
 * Moving stock as orders move.
 *
 * Two facts, kept apart, as StockLevel describes them: `quantity` is what is
 * on the shelf and `reserved` is what is promised. Placing an order raises
 * `reserved` and leaves `quantity` alone — the goods have not gone anywhere
 * yet. Shipping lowers both, because that is the moment they leave.
 *
 * The rule that decides everything else here: stock is the authority. A part
 * with no counted stock has none to sell, and an order for it is refused the
 * same way an order for a counted part that has run out is refused.
 *
 * This reverses what the module did originally, where an uncounted part sold
 * on `Product.stockDays` alone the way the whole catalogue did before
 * warehouses existed. That was the right default while the counts were being
 * filled in and the wrong one for a shop that means to sell what it holds:
 * under it, a part nobody had got around to counting was indistinguishable
 * from one with plenty, and the difference only surfaced when the customer's
 * order could not be filled.
 *
 * `availabilityOf` still tells a missing count from an empty shelf, because an
 * admin needs to know which is which. Selling does not: see
 * `sellableQuantity`, which is the single place that decision is made.
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
 * Takes a `Tx`, not the plain query helper, and that is the whole point: the
 * row locks below last exactly as long as their transaction. Run these
 * statements outside one and each commits on its own, the locks lift
 * immediately, and two customers can be sold the same last unit — which is
 * what this exists to prevent. The type is what stops it being called wrongly.
 *
 * Warehouses are drawn in `priority` order, highest first, which is what the
 * column is for. A line that one site cannot fill alone is split across the
 * next ones rather than refused.
 */
export async function reserveStock(t: Tx, needs: StockNeed[]): Promise<ReserveResult> {
  const allocations: Allocation[] = [];

  for (const need of needs) {
    // FOR UPDATE OF s locks the stock rows for the rest of the transaction, so
    // the availability read below cannot go stale between here and the write.
    // Only StockLevel is locked; the warehouse rows are read, not claimed.
    const rows = await t.sql<AvailableRow>`
      SELECT s."id", s."warehouseId", s."quantity" - s."reserved" AS available
      FROM "StockLevel" s
      JOIN "Warehouse" w ON w."id" = s."warehouseId"
      WHERE s."productId" = ${need.productId}
        AND w."active" = true
      ORDER BY w."priority" DESC, w."code" ASC
      FOR UPDATE OF s
    `;

    // No rows means nothing counted, which sums to nothing available — the
    // shortfall below refuses it without needing a case of its own. It used to
    // `continue` here and let the line through; see the note at the top.
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

      await t.sql`
        UPDATE "StockLevel" SET "reserved" = "reserved" + ${take}
        WHERE "id" = ${row.id}
      `;

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
  t: Tx,
  orderId: string,
  wasShipped: boolean,
  isShipped: boolean
): Promise<void> {
  if (wasShipped === isShipped) return;

  // Signed once here rather than per statement: leaving is negative, coming
  // back is positive, and both columns move by the same amount either way so
  // `reserved <= quantity` survives the trip.
  const direction = isShipped ? -1 : 1;

  await t.sql`
    UPDATE "StockLevel" s
    SET "quantity" = s."quantity" + (a."quantity" * ${direction}),
        "reserved" = s."reserved" + (a."quantity" * ${direction}),
        "updatedAt" = now()
    FROM "OrderItemAllocation" a
    JOIN "OrderItem" i ON i."id" = a."orderItemId"
    WHERE i."orderId" = ${orderId}
      AND s."productId" = i."productId"
      AND s."warehouseId" = a."warehouseId"
  `;
}
