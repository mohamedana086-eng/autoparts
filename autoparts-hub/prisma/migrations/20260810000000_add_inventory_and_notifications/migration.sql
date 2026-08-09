-- Inventory, baskets and notifications.
--
-- This is the first time the catalogue carries a QUANTITY. Until now a part
-- knew only how long it takes to arrive (`Product.stockDays`), which answers
-- "when" and never "how many" -- so nothing in the system could say a part was
-- out of stock. Quantity arrives as StockLevel rather than as a column on
-- Product, because the moment there is more than one warehouse a single
-- number on the part is one no warehouse can be held to.
--
-- Nothing here changes how a price is resolved. Availability and price stay
-- separate concerns: lib/pricing.ts is untouched.

-- ---------- Product images ----------

-- Order alone decides which image leads -- the lowest sortOrder is the
-- primary. An `isPrimary` flag alongside it would be a second column saying
-- the same thing, and the two could disagree.
CREATE TABLE "ProductImage" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "alt" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductImage_pkey" PRIMARY KEY ("id")
);

-- CASCADE: an image of a part that no longer exists is not a record anyone
-- can act on, and leaving orphans would block deleting the part for no reason.
ALTER TABLE "ProductImage"
  ADD CONSTRAINT "ProductImage_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "ProductImage_productId_sortOrder_idx" ON "ProductImage"("productId", "sortOrder");

-- ---------- Warehouses ----------

CREATE TABLE "Warehouse" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT,
    "address" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Warehouse_code_key" ON "Warehouse"("code");

-- ---------- Stock ----------

CREATE TABLE "StockLevel" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "binLocation" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockLevel_pkey" PRIMARY KEY ("id")
);

-- One row per part per warehouse. Two rows for the same pair would give the
-- same shelf two counts, and every reader would have to guess how to combine
-- them -- so the database refuses rather than each caller remembering to check.
CREATE UNIQUE INDEX "StockLevel_productId_warehouseId_key"
  ON "StockLevel"("productId", "warehouseId");

CREATE INDEX "StockLevel_warehouseId_idx" ON "StockLevel"("warehouseId");

ALTER TABLE "StockLevel"
  ADD CONSTRAINT "StockLevel_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StockLevel"
  ADD CONSTRAINT "StockLevel_warehouseId_fkey"
  FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Neither count can go below zero, and nothing may be promised that is not on
-- the shelf. Enforced here because these are the two ways a stock figure goes
-- wrong, and an application that forgets the check leaves numbers no later
-- reader can tell apart from real ones.
ALTER TABLE "StockLevel"
  ADD CONSTRAINT "StockLevel_quantity_not_negative" CHECK ("quantity" >= 0);

ALTER TABLE "StockLevel"
  ADD CONSTRAINT "StockLevel_reserved_within_quantity"
  CHECK ("reserved" >= 0 AND "reserved" <= "quantity");

-- ---------- Retail outlets ----------

CREATE TABLE "RetailOutlet" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "warehouseId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetailOutlet_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RetailOutlet_code_key" ON "RetailOutlet"("code");
CREATE INDEX "RetailOutlet_warehouseId_idx" ON "RetailOutlet"("warehouseId");

-- SET NULL rather than CASCADE: closing a warehouse must not delete the shop
-- counter it happened to supply. An outlet with no warehouse is a real state
-- the admin can see and fix.
ALTER TABLE "RetailOutlet"
  ADD CONSTRAINT "RetailOutlet_warehouseId_fkey"
  FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------- Baskets ----------

-- One basket per account, so there is never a question of which is current.
CREATE TABLE "Cart" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cart_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Cart_clientId_key" ON "Cart"("clientId");

ALTER TABLE "Cart"
  ADD CONSTRAINT "Cart_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- No price column, deliberately. What a line costs is resolved at checkout
-- from the catalogue and the caller's tier -- the same rule that already stops
-- a tampered localStorage cart deciding what it pays. Storing a price here
-- would create a second answer that goes stale.
CREATE TABLE "CartItem" (
    "id" TEXT NOT NULL,
    "cartId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CartItem_pkey" PRIMARY KEY ("id")
);

-- A part appears at most once in a basket; asking for more is a quantity, not
-- a second line.
CREATE UNIQUE INDEX "CartItem_cartId_productId_key" ON "CartItem"("cartId", "productId");
CREATE INDEX "CartItem_productId_idx" ON "CartItem"("productId");

ALTER TABLE "CartItem"
  ADD CONSTRAINT "CartItem_cartId_fkey"
  FOREIGN KEY ("cartId") REFERENCES "Cart"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- CASCADE, unlike OrderItem's product link. An order is a record of what was
-- actually sold and must survive the catalogue changing; a basket is only an
-- intention, and a line pointing at a deleted part is not one anyone can act on.
ALTER TABLE "CartItem"
  ADD CONSTRAINT "CartItem_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CartItem"
  ADD CONSTRAINT "CartItem_quantity_positive" CHECK ("quantity" > 0);

-- ---------- Notifications ----------

CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'system',
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- The unread badge is the only hot read: everything for one account, newest
-- first, filtered on readAt IS NULL. Both columns in one index serves it.
CREATE INDEX "Notification_clientId_readAt_idx" ON "Notification"("clientId", "readAt");

ALTER TABLE "Notification"
  ADD CONSTRAINT "Notification_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
