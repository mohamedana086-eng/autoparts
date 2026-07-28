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

Two Vercel projects off one repository, both connected to it so a push to
`main` redeploys them:

| Project | Root Directory | Live |
|---|---|---|
| `autoparts-hub` (API) | `autoparts-hub` | https://autoparts-hub-phi.vercel.app |
| `autoparts-storefront` | `web` | https://autoparts-storefront.vercel.app |

The API project needs `DATABASE_URL` and `AUTH_SECRET`. The storefront needs
nothing — it holds no secrets and reads everything through `/api`.

**Root Directory has to be set in the dashboard.** `vercel project update`
covers the framework preset, build command, output directory and install
command, but not this one, and a git-triggered build with it left at `.`
starts from the repository root, where there is no application to build.
Project → Settings → Build & Deployment → Root Directory.

The `/api` rewrite in `vercel.json` is what keeps the session cookie
first-party. Pointing the Angular app straight at a different origin would
need CORS plus `SameSite=None`, and browsers that block third-party cookies
would silently drop the session.

## Not built yet

Checkout does not submit orders — the cart is browser-only. The Next app
still serves its own copy of the UI at `/` and `/admin`; nothing routes to
it now that Angular covers both.
