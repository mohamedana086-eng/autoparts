-- Whether a supplier takes stock back.
--
-- Its own column rather than a third value of `reliability`. "Official
-- distributor", "reliable" and "accepts returns" are not alternatives to one
-- another -- a supplier can be an official distributor who refuses returns,
-- or a standard wholesaler who takes them. Folding returns into the same
-- enum would force a choice between two facts that are both true.
--
-- Nullable, and left null for every existing supplier. Defaulting to false
-- would put "does not accept returns" on the page for suppliers whose terms
-- nobody has recorded, which is a claim we cannot make on their behalf --
-- and the wrong direction to guess in, since a buyer who believes returns
-- are refused simply buys elsewhere.

ALTER TABLE "Supplier" ADD COLUMN "acceptsReturns" BOOLEAN;

-- Search filters on it, joined from Product.
CREATE INDEX "Supplier_acceptsReturns_idx" ON "Supplier"("acceptsReturns");
