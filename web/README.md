# AutoParts Hub — Angular storefront

The storefront UI. Angular 22, standalone components, signals, lazy-loaded
routes, Tailwind carrying the same theme as the Next app.

There is no database access here. Every page reads from the Next.js API in
[`../autoparts-hub`](../autoparts-hub) under `/api`.

## Running it

Both processes need to be up — the API on 3000, this on 4200:

```bash
npm run dev --prefix autoparts-hub   # API on :3000
npm start --prefix web               # storefront on :4200
```

`proxy.conf.json` forwards `/api` from :4200 to :3000. That matters for more
than convenience: the session lives in an httpOnly cookie, and proxying keeps
it first-party, so no CORS setup and no `withCredentials` are needed.

## Pages

| Route | What it does |
|---|---|
| `/` | Hero, search, browse-by-system grid |
| `/search?q=&system=` | Results priced for the caller's tier |
| `/product/:id` | Detail, interchanges, add to cart |
| `/cart` | Quantities, totals, held in `localStorage` |
| `/login`, `/register` | Session auth against the API |

Prices are resolved server-side from the session, so signing in changes what
every page shows — a BMW cooling part is €70.82 at Retail and €50.45 on the
Price 9 tier, via the markup rule that matches.

## Deploying

Two Vercel projects off one repository:

1. **API** — Root Directory `autoparts-hub`, with `DATABASE_URL` and
   `AUTH_SECRET` set.
2. **Storefront** — Root Directory `web`. Edit `vercel.json` and replace the
   rewrite destination with the API deployment's URL.

The rewrite is what keeps the cookie first-party. Pointing the Angular app
straight at a different origin would need CORS plus `SameSite=None`, and
browsers that block third-party cookies would silently drop the session.

## Not built yet

The admin panel is still served by the Next app at `/admin`. Checkout does not
submit orders — the cart is browser-only.
