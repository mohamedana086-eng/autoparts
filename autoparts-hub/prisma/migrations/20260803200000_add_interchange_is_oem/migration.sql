-- Separate "is the vehicle maker's own number" from "is an exact equivalent".
--
-- `exactMatch` was already carrying the second meaning: the seeded catalogue
-- marks a TRW pad as an exact match for a Brembo one, which is true and has
-- nothing to do with either being OE. The product page shows it that way too.
-- Customers searching a number off a dealer invoice are asking the first
-- question, and nothing answered it -- so this is a new column rather than a
-- reinterpretation of one already on screen.
--
-- Backfilled from Manufacturer.isOEM, matched on brand name, which is the
-- only signal the existing rows carry. Interchanges naming a brand that is
-- not in the manufacturer table stay false: every such brand in the seeded
-- data is aftermarket, and guessing the other way would put a wrong "OE"
-- badge on a part number. The TecDoc importer sets this from the number type
-- directly, which is authoritative, so imported rows never rely on the join.

ALTER TABLE "Interchange" ADD COLUMN "isOEM" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Interchange" i
SET "isOEM" = true
FROM "Manufacturer" m
WHERE upper(m."name") = upper(i."targetManufacturer")
  AND m."isOEM" = true;

CREATE INDEX "Interchange_isOEM_idx" ON "Interchange"("isOEM");
