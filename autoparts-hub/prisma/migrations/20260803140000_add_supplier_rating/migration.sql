-- An admin-set performance rating for a supplier, 1-5.
--
-- Separate from `reliability`, which says what the trading relationship is
-- (official distributor / reliable / standard). A supplier can be an official
-- distributor and still deliver late, so the two answer different questions
-- and the search filter needs the one that is about performance.
--
-- Nullable, and left null for every existing supplier: nobody has rated them
-- yet, and defaulting to a number would invent a judgement. The CHECK keeps
-- the range honest at the database rather than trusting every future caller.

ALTER TABLE "Supplier" ADD COLUMN "rating" INTEGER;

ALTER TABLE "Supplier"
  ADD CONSTRAINT "Supplier_rating_range"
  CHECK ("rating" IS NULL OR ("rating" >= 1 AND "rating" <= 5));

-- Search filters on it, joined from Product.
CREATE INDEX "Supplier_rating_idx" ON "Supplier"("rating");
