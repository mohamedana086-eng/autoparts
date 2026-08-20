# AutoParts Hub — API

The backend for a B2B/B2C auto-parts catalogue: a JSON API over Postgres
plus a rule-based markup/pricing engine, built with Next.js 14 (App
Router) and Prisma.

**This project serves no pages.** `app/` holds route handlers and nothing
else — the whole UI, storefront and admin alike, is the Angular app in
[`../web`](../web), which reaches this through `/api`. It used to carry a
second copy of that UI; it was deleted once Angular covered both, because
a page nobody routes to is a page nobody notices going wrong. Its Server
Actions were relying on a layout redirect that does not gate them.

## What's here

- **Auth** — `/api/auth/{login,register,logout,session}`. Email +
  password, sessions via a signed httpOnly cookie (no external auth
  library). Four account types:
  - **ADMIN** — every `/api/admin` endpoint.
  - **SALES** — staff; reaches only its own customers and their orders.
  - **B2B** (trade) — self-registers on the Retail tier until an admin
    assigns a negotiated pricing category.
  - **RETAIL** — self-registers, instant access at the Retail tier.
  Seeded logins (see below) let you try them immediately.
- **Catalogue** — `/api/catalog/search`, `/api/catalog/products/[id]`,
  `/api/catalog/bulk`, `/api/products`, `/api/systems`, `/api/suppliers`,
  `/api/vehicles` and VIN lookup. Prices come back resolved for whoever
  is signed in.
- **Admin** — `/api/admin/**`: products (with images and per-warehouse
  stock), suppliers, warehouses, retail outlets, customers, client
  categories, currencies, markup rules, orders, open baskets,
  notifications, dashboard stats. Every one of them is gated by
  `requireAdmin()` or `requireStaff()` in `lib/admin-guard.ts` — the gate
  lives in the handler, never in a layout or a hidden link.
- **Stock** — `lib/inventory.ts`. Placing an order holds the units behind it:
  `StockLevel.reserved` goes up, `quantity` stays put until the goods actually
  leave, and marking the order shipped or paid brings both down. Warehouses
  are drawn highest-`priority` first and a line too big for one site is split
  across the next, recorded per warehouse in `OrderItemAllocation` so shipping
  knows which shelf to draw down. Reservation runs inside the order's own
  transaction under row locks, so two customers cannot be sold the same last
  unit.

  **Stock is the authority: a part with nothing counted has nothing to
  sell.** An order for it is refused the same way an order for a counted part
  that has run out is refused, and the storefront shows both as "Out of
  stock". `availabilityOf()` still tells the two apart — `null` for an
  unfilled record, `0` for an empty shelf — because an admin needs to know
  which is which; `sellableQuantity()` is the one place they collapse, and
  changing the policy back means changing that function.

  Availability counts only warehouses that can be picked from, the same
  restriction `reserveStock` applies, so a page and a checkout cannot
  disagree about whether a part can be had. The quantity controls on the
  product, cart and bulk pages stop at what is available and say so; that is
  a courtesy, and `reserveStock` under a row lock is what actually holds the
  line.

  **This means a part nobody has counted cannot be sold at all.** Filling in
  stock is therefore a prerequisite for selling, not an optional refinement.

- **Purchase price lists** — `lib/price-lists.ts`, `/api/admin/price-lists`.
  What a part costs to buy, as a list with a source and a date rather than a
  number sitting on the part. Upload as many as you like — several covering
  the same parts is the point — but **at most one is active**, enforced by a
  partial unique index rather than by route code, and switching one on stands
  the other down in the same transaction. A part the active list does not
  mention keeps its own `basePrice`, so a list covering half the catalogue
  reprices half of it and takes nothing off sale. Uploads arrive inactive:
  loading a file and changing every price are two decisions. Prices quoted in
  another currency are converted on the way in — dividing by the rate, since
  a rate is units-per-base — and the original is kept beside the converted
  figure so it can be checked against the supplier's own paperwork.

- **Pricing engine** — `lib/pricing.ts`. Given a product + client, it
  finds the most specific active markup rule that matches and applies it
  (percent / flat amount / fixed price), falling back to the client's
  category default markup. Then the account's negotiated discount, then
  the currency conversion — each exactly once, in that order.
- **Data model** — `prisma/schema.prisma`: vehicle systems, manufacturers,
  suppliers, products, interchanges, client categories, clients (with
  auth fields + role), markup rules, orders, warehouses, stock levels,
  retail outlets, saved baskets, notifications. Documentation only —
  `prisma/migrations` is what the database is actually built from, and
  nothing generates from the schema file. See its header.
- **Database access** — `lib/sql.ts`. Every query in the application is raw
  SQL through a tagged template, which binds its parameters; no query text is
  assembled from strings anywhere. Queries live in `lib/` modules, not in
  route handlers. There is no ORM.

## Getting started

Needs a Postgres database — a local one, or just point `DATABASE_URL` at
the same hosted database the deployment uses.

```bash
npm install
cp .env.example .env   # then set DATABASE_URL and AUTH_SECRET
npm run db:deploy      # applies prisma/migrations to the database
npm run db:seed        # sample catalog, client categories, rules, accounts
npm run db:stock       # counts the catalogue in — see below
npm run dev
```

`db:stock` is not optional if you want to sell anything. Stock is what decides
whether a part can be bought, so a freshly seeded catalogue that nobody has
counted is a catalogue where every part reads "Out of stock" and nothing can be
added to a basket. It writes deliberately varied figures — most parts
comfortable, a dozen down to their last one or two, a couple with none — so the
ceiling and the refusal are both reachable without emptying a shelf by hand.

It is idempotent and safe on the deployed database: a part that already has any
stock row is left alone, so a count entered in the admin survives a re-run.
`npm run db:stock -- --reset` is the only way it overwrites, and even then it
keeps the reservations open orders are holding rather than writing over them.

### When the shelves and the orders disagree

```bash
npm run db:reconcile          # report
npm run db:reconcile -- --fix # repair
```

`StockLevel.reserved` is a stored copy of something derivable — the units live
orders hold against that shelf, which is the sum of their `OrderItemAllocation`
rows. Storing it makes availability one cheap read instead of a join per part,
and makes it possible for the two to drift: the admin stock editor takes
`reserved` as a free number, deleting a shelf there leaves an order's
allocation behind, and re-seeding rewrites the shelves.

Drift is not cosmetic. Releasing more than a shelf says is reserved drives the
column below zero, the CHECK constraint refuses the whole transaction, and the
order can never be marked shipped. The status endpoint answers that with a 409
naming the problem rather than a stack trace, and this command is what fixes
it. Where a shelf holds fewer units than its orders were promised, repair
raises the count to cover them and prints every raise — those units are already
owed to a customer, and the alternative is an order nobody can ship.

That serves the API on http://localhost:3000. There is nothing to look at
there — `/` is a 404 by design. Start the Angular app as well and use it
on :4200, which proxies `/api` back here:

```bash
npm start --prefix ../web
```

## Tests

```bash
npm test          # once
npm run test:watch
```

Vitest, over the pure modules in `lib/` — the pricing engine, session token
verification, part-number normalisation and the admin validators. No database
and no HTTP: everything covered here is a function of its arguments, which is
why it can be pinned down exactly.

Nothing that reaches Prisma is faked. A mocked client proves the mock behaves,
not the query, so the routes are checked by running them against a real
database instead.

`lib/pricing.ts` is the one to keep covered as it changes. It decides what
every customer pays, the order of its three steps is load-bearing — markup,
then discount, then currency — and getting it wrong is invisible until someone
adds up an invoice.

## Deploying to Vercel

1. Provision Postgres (Neon, Vercel Postgres, Supabase — all have free
   tiers) and copy the **pooled** connection string.
2. Import the repo at vercel.com/new. Framework preset Next.js; the
   defaults are correct.
3. Set two environment variables in the Vercel project:
   - `DATABASE_URL` — the pooled connection string
   - `AUTH_SECRET` — a fresh `openssl rand -hex 32`. The app refuses to
     start signing without it: in production, an unset, placeholder or
     under-32-character secret throws on the first request that touches a
     session rather than quietly signing forgeable cookies. The build is
     unaffected, so this surfaces on the deployment, not in CI.
4. Create the schema once, from your machine, with `DATABASE_URL`
   pointing at the hosted database: `npm run db:deploy` — then
   `npm run db:seed` for the sample catalog and accounts.
5. Deploy.

The build deliberately does **not** run migrations. Every route is
rendered on demand, so nothing touches the database at build time, and
keeping migrations out means an unreachable database cannot fail a
deploy (it shows up as `P1001` mid-build). Run `npm run db:deploy`
yourself whenever a migration needs applying.

Note that SQLite cannot be used on Vercel — serverless instances get an
ephemeral, read-only filesystem — which is why this uses Postgres.

### Seeded logins

| Role   | Email                        | Password    |
|--------|-------------------------------|-------------|
| Admin  | admin@autopartshub.com        | admin123    |
| B2B    | protogeros@example.com        | trade123    |
| Retail | walk-in@example.com           | retail123   |

Change these (or delete the accounts) before deploying anywhere public.

## Importing the catalogue from TecDoc

`prisma/import-tecdoc.ts` replaces the hand-seeded sample with real articles,
vehicles and fitment from a TecAlliance subscription.

```bash
npm run db:import:tecdoc -- --fixture=prisma/fixtures/tecdoc-sample.json
npm run db:import:tecdoc -- --brand=BOSCH --limit=500
npm run db:import:tecdoc -- --brand=BOSCH --limit=500 --apply
```

It is a **dry run unless `--apply` is passed** — it reads, maps, reports what
it would change, and writes nothing. Run it that way first; against the
deployed database this is the job with the most reach.

| Flag | Effect |
|---|---|
| `--apply` | Write. Without it, nothing is written. |
| `--fixture=PATH` | Replay canned responses instead of calling the service. No credentials needed. |
| `--brand=NAME` | Only this brand. Repeatable. Default is every brand, which is a lot — start narrow. |
| `--limit=N` | Stop after N articles. |
| `--vehicles` | Also import the vehicle tree and fitment. One extra call per article. |

Set `TECDOC_API_KEY` and `TECDOC_PROVIDER_ID` from your subscription (see
`.env.example`). `TECDOC_COUNTRY` matters more than it looks: TecDoc filters
the catalogue by market, so the wrong country returns a smaller catalogue
rather than an error.

### It does not import prices

TecDoc is a catalogue — articles, brands, vehicle linkage, OE and competitor
references. It carries no purchase price, and `Product.basePrice` is the
supplier purchase price the whole markup engine multiplies up. So a newly
imported article lands with `basePrice` 0 and cannot be sold until a supplier
price list gives it a real one, and an existing product's `basePrice`,
`currency` and `supplierId` are never touched by the import, so negotiated
pricing and hand-corrected sourcing survive every re-run. The closing report
counts what is still waiting on a price.

### Running it offline

Everything about TecAlliance's wire format lives in `lib/tecdoc/types.ts` and
`lib/tecdoc/client.ts`; `lib/tecdoc/map.ts` is pure functions turning those
shapes into ours. `--fixture` replays
`prisma/fixtures/tecdoc-sample.json` through the same code path, so the
mapping, the upserts and the report can be exercised without a subscription.
The fixture covers the awkward cases on purpose: an article matching no
vehicle system, one with no name, two brands shipping the same part number,
and a fitment pointing outside the imported tree.

### Two things to know before a full import

- **Part numbers collide.** `Product.partNumber` is unique across the whole
  catalogue, but TecDoc's are only unique per brand — two brands can ship the
  same number legitimately. The import reports every collision and skips it
  rather than overwriting another brand's product. A real fix is a compound
  unique key on `(manufacturerId, partNumber)` and a migration to match.
- **Imported makes have no WMI codes.** TecDoc does not publish them, and
  they are what `lib/vin.ts` reads a chassis number with. VIN lookup keeps
  working for the seeded makes and stays silent for imported ones until the
  codes are filled in.

## Notes / next steps

- No password-reset flow yet.
- A session carries its `role` and `categoryId` in the cookie for seven
  days and there is no revocation, so demoting an admin, or moving a
  customer to another pricing tier, does not take effect until they sign
  in again. The account's discount and currency are already read fresh
  from the database on every request; these two are not.
- Nothing rate-limits `/api/auth/login`. bcrypt makes guessing slow, not
  impossible.
- The seeded accounts above are real working logins. Delete them before
  the deployment is public, especially the Admin one.
- The seeded catalog/interchange data is a small hand-written sample. The
  TecDoc import above replaces it with real data; it still needs a supplier
  price list on top, because TecDoc carries no purchase prices.
