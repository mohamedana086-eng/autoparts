-- Purchase prices become a list you can swap.
--
-- Until now a part's purchase price was Product.basePrice and nothing else: a
-- single number, with no record of where it came from, what it was before, or
-- when it changed. Replacing a supplier's prices meant editing every part, and
-- there was no way to put the old ones back.
--
-- A PriceList is that number given a source and a date. At most one is active;
-- a part the active list does not mention keeps using its own basePrice, so
-- uploading a list that covers half the catalogue takes nothing off sale. That
-- fallback is why this migration changes no existing data and drops no column:
-- basePrice stays exactly as it is and stays the answer wherever a list is
-- silent.

CREATE TABLE "PriceList" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "sourceName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceList_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PriceListItem" (
    "id" TEXT NOT NULL,
    "priceListId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "sourcePrice" DOUBLE PRECISION,
    "sourceCurrency" TEXT,

    CONSTRAINT "PriceListItem_pkey" PRIMARY KEY ("id")
);

-- CASCADE from the list: a line has nothing to say once the list is deleted.
ALTER TABLE "PriceListItem"
  ADD CONSTRAINT "PriceListItem_priceListId_fkey"
  FOREIGN KEY ("priceListId") REFERENCES "PriceList"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- CASCADE from the part too: a price for a part that no longer exists prices
-- nothing, and keeping it would block deleting the part for no reason.
ALTER TABLE "PriceListItem"
  ADD CONSTRAINT "PriceListItem_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- One price per part per list. A file naming the same part twice is a mistake
-- in the file, and this is where it stops.
CREATE UNIQUE INDEX "PriceListItem_priceListId_productId_key"
  ON "PriceListItem"("priceListId", "productId");

-- Every priced query looks up a part's line in the active list, so this is the
-- index that read runs on.
CREATE INDEX "PriceListItem_productId_idx" ON "PriceListItem"("productId");

-- A purchase price is not negative. Zero is allowed and meaningful: it is what
-- a TecDoc-imported article lands on before any supplier has priced it.
ALTER TABLE "PriceListItem"
  ADD CONSTRAINT "PriceListItem_price_not_negative" CHECK ("price" >= 0);

-- At most one list active, enforced here rather than in application code.
-- A partial unique index means the second activation fails at the database
-- instead of quietly leaving two lists claiming to set the same prices —
-- which is the state no amount of careful route code can be trusted to
-- prevent forever. Zero active rows stays legal: it means every part falls
-- back to its own basePrice.
CREATE UNIQUE INDEX "PriceList_one_active" ON "PriceList" ("active") WHERE "active" = true;
