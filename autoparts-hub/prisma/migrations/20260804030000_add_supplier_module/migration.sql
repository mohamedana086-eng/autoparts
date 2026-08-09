-- Supplier profile: where they are, what they stand behind, how fast they
-- ship, and what they invoice in.
--
-- `dealer` joins the reliability vocabulary rather than becoming a second
-- column. It is an alternative to being an official distributor, not an extra
-- fact alongside it, so a supplier is one of official / dealer / reliable /
-- standard and there are no two columns that can contradict each other.
-- Nothing to migrate: no existing row claims a value outside the old set.

ALTER TABLE "Supplier" ADD COLUMN "country" TEXT;

-- Months. Null means no warranty has been agreed, which is different from a
-- warranty of zero months -- the same distinction rating and returns already
-- draw, and for the same reason: an unasked question is not a bad answer.
ALTER TABLE "Supplier" ADD COLUMN "guaranteeMonths" INTEGER;

-- A fallback for parts that have no lead time of their own. Product.stockDays
-- keeps winning wherever it is set: it is per-part reality, and overwriting
-- hand-entered times with a supplier average would lose information nobody
-- could get back.
ALTER TABLE "Supplier" ADD COLUMN "defaultStockDays" INTEGER;

-- Reference only. Product.basePrice stays denominated in the base currency,
-- so this changes nothing about how a price is resolved -- deliberately, since
-- converting purchase prices per supplier would make every catalogue price
-- move with an exchange rate nobody reviewed.
ALTER TABLE "Supplier" ADD COLUMN "purchaseCurrencyId" TEXT;

ALTER TABLE "Supplier"
  ADD CONSTRAINT "Supplier_purchaseCurrencyId_fkey"
  FOREIGN KEY ("purchaseCurrencyId") REFERENCES "Currency"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Supplier_purchaseCurrencyId_idx" ON "Supplier"("purchaseCurrencyId");
CREATE INDEX "Supplier_country_idx" ON "Supplier"("country");
