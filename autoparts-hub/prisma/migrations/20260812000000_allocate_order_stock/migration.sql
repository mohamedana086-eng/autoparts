-- Orders draw on stock.
--
-- Until now placing an order wrote an Order and its lines and touched nothing
-- else: StockLevel.reserved was described as "committed to orders that have
-- not shipped" but no code path ever wrote to it, so the column said something
-- no order had ever made true. This is the table that connects the two.
--
-- What it does NOT change: a part nobody has counted into a warehouse stays
-- sellable. Having no stock row means untracked, not out of stock -- the
-- catalogue sold on `Product.stockDays` alone before warehouses existed and it
-- still does. Only a part someone has actually counted is held to a number.
-- Reading absence as zero would have taken the whole catalogue off sale the
-- moment this shipped.

CREATE TABLE "OrderItemAllocation" (
    "id" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "OrderItemAllocation_pkey" PRIMARY KEY ("id")
);

-- CASCADE from the line: an allocation records where that line's stock was
-- held, so it has nothing left to say once the line is gone.
ALTER TABLE "OrderItemAllocation"
  ADD CONSTRAINT "OrderItemAllocation_orderItemId_fkey"
  FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- RESTRICT to the warehouse, deliberately unlike the line above: deleting a
-- warehouse that still holds stock against live orders would silently drop the
-- record of where those goods are. Closing a site sets `active` false, which
-- is what the column is for.
ALTER TABLE "OrderItemAllocation"
  ADD CONSTRAINT "OrderItemAllocation_warehouseId_fkey"
  FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- One row per line per warehouse. A line split across two sites is two rows;
-- the same site twice is a mistake the key refuses.
CREATE UNIQUE INDEX "OrderItemAllocation_orderItemId_warehouseId_key"
  ON "OrderItemAllocation"("orderItemId", "warehouseId");

CREATE INDEX "OrderItemAllocation_warehouseId_idx"
  ON "OrderItemAllocation"("warehouseId");

-- A reservation is always for at least one unit. A zero-quantity allocation
-- would claim a shelf was involved while reserving nothing from it.
ALTER TABLE "OrderItemAllocation"
  ADD CONSTRAINT "OrderItemAllocation_quantity_positive" CHECK ("quantity" > 0);
