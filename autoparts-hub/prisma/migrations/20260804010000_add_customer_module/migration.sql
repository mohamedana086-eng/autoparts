-- The customer module: currency, negotiated discount, and an owning salesperson.
--
-- No new pricing entity. "Categories" and "price lists" are the same thing
-- the catalogue already had -- ClientCategory, carrying the tier's default
-- markup -- so this adds the two inputs that genuinely were not expressible
-- (a per-account discount and a quoting currency) and leaves the engine's
-- one-winner rule resolution alone.
--
-- Order of operations, fixed here and documented in lib/pricing.ts:
--   purchase price -> markup rule (or the tier default) -> discount -> currency
-- Each concept applies exactly once, in one place.

CREATE TABLE "Currency" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "isBase" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Currency_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Currency_code_key" ON "Currency"("code");

-- At most one base. A partial unique index says it at the database rather
-- than trusting every future caller to check first: converting against two
-- different bases would silently produce two different prices for one part.
CREATE UNIQUE INDEX "Currency_single_base" ON "Currency"("isBase") WHERE "isBase" = true;

-- The catalogue's purchase prices are already denominated in EUR -- every
-- Product row defaults `currency` to it -- so EUR is the base and its rate is
-- 1 by definition.
INSERT INTO "Currency" ("id", "code", "name", "symbol", "rate", "isBase", "active")
VALUES ('cur_base_eur', 'EUR', 'Euro', '€', 1, true, true);

-- Zero, not null: every account has a discount, and for almost all of them it
-- is none. Null would make "no discount agreed" and "discount of nothing"
-- look different to the pricing engine when they are the same.
ALTER TABLE "Client" ADD COLUMN "discountPercent" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Null means the base currency, so existing accounts keep being quoted
-- exactly as they were.
ALTER TABLE "Client" ADD COLUMN "currencyId" TEXT;

ALTER TABLE "Client" ADD COLUMN "salesManagerId" TEXT;

ALTER TABLE "Client"
  ADD CONSTRAINT "Client_currencyId_fkey"
  FOREIGN KEY ("currencyId") REFERENCES "Currency"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- SET NULL rather than RESTRICT: a salesperson leaving should not block
-- deleting their account, and an unassigned customer is a real state the
-- admin can see and fix.
ALTER TABLE "Client"
  ADD CONSTRAINT "Client_salesManagerId_fkey"
  FOREIGN KEY ("salesManagerId") REFERENCES "Client"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Client_currencyId_idx" ON "Client"("currencyId");
CREATE INDEX "Client_salesManagerId_idx" ON "Client"("salesManagerId");

-- An order records the currency it was quoted in and the rate that applied,
-- because neither can be recovered later: a customer's currency can be
-- changed and a rate certainly will be, and reading either off the account
-- would silently rewrite what past orders said.
--
-- OrderItem.unitPrice stays in the BASE currency. It is what the tier's
-- minimum order is compared against and what margin is measured from, and
-- both stop meaning anything if the number moves with whichever currency the
-- buyer happens to be set to. Multiply by currencyRate to show the order as
-- the customer saw it.
--
-- Defaults match every existing order: all of them were placed in EUR at the
-- only rate there was.
ALTER TABLE "Order" ADD COLUMN "currencyCode" TEXT NOT NULL DEFAULT 'EUR';
ALTER TABLE "Order" ADD COLUMN "currencyRate" DOUBLE PRECISION NOT NULL DEFAULT 1;
