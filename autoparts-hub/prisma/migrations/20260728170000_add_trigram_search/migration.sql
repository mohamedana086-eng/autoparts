-- Trigram support, so search can fall back to close matches when a query
-- has a typo in it and nothing matches exactly.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN trigram indexes for the columns the fuzzy fallback scores against.
-- The catalogue is small enough today that these change nothing; they are
-- here so similarity() does not turn into a sequential scan as it grows.
CREATE INDEX IF NOT EXISTS "Product_name_trgm_idx"
  ON "Product" USING gin (lower("name") gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "Product_partNumber_trgm_idx"
  ON "Product" USING gin (lower("partNumber") gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "Manufacturer_name_trgm_idx"
  ON "Manufacturer" USING gin (lower("name") gin_trgm_ops);
