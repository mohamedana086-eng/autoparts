-- Remember TecDoc's own ids, so an import can be re-run.
--
-- Without these, a second import has no way to tell that a row it is about
-- to create is the one it created last time: TecDoc identifies an article by
-- (brandNo, articleId) and a vehicle by vehicleId, and neither survives in a
-- name or a part number. Fitment is the case that actually breaks — linking
-- an article to a vehicle needs the vehicle looked up by TecDoc's id, not by
-- a model name that two makes can share.
--
-- All nullable: the hand-seeded catalogue has no TecDoc ids and is left
-- alone. Postgres permits repeated NULLs under a unique index, so the
-- uniqueness only constrains rows that were actually imported.

ALTER TABLE "Product" ADD COLUMN "tecDocId" INTEGER;
ALTER TABLE "VehicleMake" ADD COLUMN "tecDocId" INTEGER;
ALTER TABLE "VehicleModel" ADD COLUMN "tecDocId" INTEGER;
ALTER TABLE "VehicleVariant" ADD COLUMN "tecDocId" INTEGER;

CREATE UNIQUE INDEX "Product_tecDocId_key" ON "Product"("tecDocId");
CREATE UNIQUE INDEX "VehicleMake_tecDocId_key" ON "VehicleMake"("tecDocId");
CREATE UNIQUE INDEX "VehicleModel_tecDocId_key" ON "VehicleModel"("tecDocId");
CREATE UNIQUE INDEX "VehicleVariant_tecDocId_key" ON "VehicleVariant"("tecDocId");

-- Part-number search normalises separators away and currently does so with
-- a per-row regexp_replace (see idsMatchingNormalisedPartNumber). That is a
-- scan, which was fine for a hand-seeded catalogue and is not fine once a
-- real import lands hundreds of thousands of articles. Index the normalised
-- form so the scan becomes a lookup.
CREATE INDEX "Product_partNumber_normalised_idx"
  ON "Product" ((regexp_replace(upper("partNumber"), '[^A-Z0-9]', '', 'g')) text_pattern_ops);

CREATE INDEX "Interchange_targetPartNo_normalised_idx"
  ON "Interchange" ((regexp_replace(upper("targetPartNo"), '[^A-Z0-9]', '', 'g')) text_pattern_ops);
