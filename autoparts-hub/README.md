# AutoParts Hub

A B2B/B2C auto-parts catalog: storefront + admin panel + a rule-based
markup/pricing engine, built with Next.js 14 (App Router), Prisma, and
SQLite.

## What's here

- **Storefront** — `/` hero + browse-by-system, `/search` results with
  live resolved pricing, `/product/[id]` detail page with interchanges.
- **Auth** — `/login`, `/register`. Email + password, sessions via a
  signed httpOnly cookie (no external auth library). Three account
  types:
  - **Admin** — full access to `/admin`.
  - **B2B** (trade) — self-registers, starts on the Retail tier, then
    an admin assigns a negotiated pricing category from `/admin/clients`.
  - **Retail** — self-registers, instant access at the Retail tier.
  Seeded logins (see below) let you try all three immediately.
- **Admin panel** — `/admin` dashboard (protected — redirects to
  `/login` if you're not an Admin), `/admin/clients` (assign role +
  pricing tier per account), `/admin/client-categories` (pricing
  tiers), `/admin/markup-rules` (the complex markup rule builder —
  filter by client category, supplier, manufacturer, vehicle system,
  part-number prefix, and purchase-price band).
- **Pricing engine** — `lib/pricing.ts`. Given a product + client, it
  finds the most specific active markup rule that matches and applies
  it (percent / flat amount / fixed price). Falls back to the client's
  category default markup if no rule matches. Storefront pages
  automatically price using the signed-in user's own tier.
- **Data model** — `prisma/schema.prisma`: vehicle systems, manufacturers,
  suppliers, products, interchanges, client categories, clients (with
  auth fields + role), markup rules, orders.

## Getting started

Needs a Postgres database — a local one, or just point `DATABASE_URL` at
the same hosted database the deployment uses.

```bash
npm install
cp .env.example .env   # then set DATABASE_URL and AUTH_SECRET
npx prisma generate    # npm blocks install scripts, so run this explicitly
npm run db:migrate     # applies prisma/migrations to the database
npm run db:seed        # sample catalog, client categories, rules, accounts
npm run dev
```

Open http://localhost:3000 for the storefront and
http://localhost:3000/admin for the admin panel.

## Deploying to Vercel

1. Provision Postgres (Neon, Vercel Postgres, Supabase — all have free
   tiers) and copy the **pooled** connection string.
2. Import the repo at vercel.com/new. Framework preset Next.js; the
   defaults are correct.
3. Set two environment variables in the Vercel project:
   - `DATABASE_URL` — the pooled connection string
   - `AUTH_SECRET` — a fresh `openssl rand -hex 32`. Do **not** reuse the
     dev placeholder; anyone who knows it can forge session cookies.
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

- Set a real `AUTH_SECRET` in `.env` before deploying — anyone who
  knows the dev placeholder value could forge session cookies.
- No password-reset flow yet.
- The seeded accounts above are real working logins. Delete them before
  the deployment is public, especially the Admin one.
- The seeded catalog/interchange data is a small hand-written sample. The
  TecDoc import above replaces it with real data; it still needs a supplier
  price list on top, because TecDoc carries no purchase prices.
