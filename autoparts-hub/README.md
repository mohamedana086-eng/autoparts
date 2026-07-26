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
4. Deploy. `npm run build` runs `prisma migrate deploy`, so the schema is
   created on the first build.
5. Seed once, from your machine, with `DATABASE_URL` pointing at the
   hosted database: `npm run db:seed`.

Note that SQLite cannot be used on Vercel — serverless instances get an
ephemeral, read-only filesystem — which is why this uses Postgres.

### Seeded logins

| Role   | Email                        | Password    |
|--------|-------------------------------|-------------|
| Admin  | admin@autopartshub.com        | admin123    |
| B2B    | protogeros@example.com        | trade123    |
| Retail | walk-in@example.com           | retail123   |

Change these (or delete the accounts) before deploying anywhere public.

## Notes / next steps

- Set a real `AUTH_SECRET` in `.env` before deploying — anyone who
  knows the dev placeholder value could forge session cookies.
- No password-reset flow yet.
- The seeded accounts above are real working logins. Delete them before
  the deployment is public, especially the Admin one.
- The catalog/interchange data here is a small hand-seeded sample —
  connect it to your real supplier feeds (e.g. TecAlliance/TecDoc) by
  replacing `prisma/seed.ts` with an import job.
