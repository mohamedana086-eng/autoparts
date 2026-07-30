-- Suppliers get a public page, and a part records who it is bought from.
--
-- Written by hand rather than generated: `slug` is NOT NULL and unique on a
-- table that already has rows, so it is added nullable, backfilled from the
-- existing code, and only then tightened.

ALTER TABLE "Supplier" ADD COLUMN "slug" TEXT;
ALTER TABLE "Supplier" ADD COLUMN "description" TEXT;

UPDATE "Supplier" SET "slug" = lower("code") WHERE "slug" IS NULL;

ALTER TABLE "Supplier" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX "Supplier_slug_key" ON "Supplier"("slug");

-- Nullable: a part may be listed before sourcing is settled.
ALTER TABLE "Product" ADD COLUMN "supplierId" TEXT;

ALTER TABLE "Product"
  ADD CONSTRAINT "Product_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Product_supplierId_idx" ON "Product"("supplierId");
