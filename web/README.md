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
| `/cart` | Quantities, totals, held in `localStorage`, checkout |
| `/orders` | The signed-in customer's own order history |
| `/bulk` | Check a spreadsheet of part numbers in one go |
| `/login`, `/register` | Session auth against the API |
| `/admin/**` | Dashboard, products, clients, tiers, markup rules, orders |

Prices are resolved server-side from the session, so signing in changes what
every page shows — a BMW cooling part is €70.82 at Retail and €50.45 on the
Price 9 tier, via the markup rule that matches.

## Tests

```bash
npm test
```

Vitest, via `ng test`. `mergeBaskets` in `core/cart.service.ts` is what is
covered: it is the one piece of the sync that is a plain function of its
inputs, and the rule it encodes — union both baskets, take the larger
quantity rather than the sum, trust the server's prices — is the part that
would cost a customer a line if it were wrong.

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

Mind which project you are editing: the API's Vercel project and the
directory it builds from are both called `autoparts-hub`, while the
storefront's project is `autoparts-storefront` and its directory is `web`.
The repository is laid out as:

```
autoparts/
├─ autoparts-hub/   → project autoparts-hub        (the API)
└─ web/             → project autoparts-storefront (this app)
```

The `/api` rewrite in `vercel.json` is what keeps the session cookie
first-party. Pointing the Angular app straight at a different origin would
need CORS plus `SameSite=None`, and browsers that block third-party cookies
would silently drop the session.

## Checkout

The cart lives in `localStorage`, but placing an order sends only product ids
and quantities. The API prices every line itself from the catalogue and the
caller's tier, so a tampered cart cannot decide what it pays, and it enforces
the tier's minimum order amount. The cart is cleared only once the order is
recorded.

Placing an order also holds the stock behind it, so a part someone has counted
into a warehouse can be refused with a 409 naming what is left. A part nobody
has counted is untracked, not out of stock, and still sells on its lead time —
see the API's README. Either way the cart survives a refusal intact.

## The basket, and the copy on the server

`localStorage` is still what renders: instant, works signed out, and it holds
the display fields the API does not store. A signed-in basket is mirrored to
`/api/cart` on top of that, which is what lets it follow the customer to
another device and what puts it on the admin's open-baskets list.

Signing in merges rather than replaces — parts added while anonymous survive,
and a basket left on another device comes back. Where both know a part the
larger quantity wins, not the sum, so the same basket synced twice does not
quietly double. Signing out empties it here; the server's copy is untouched
and returns on the next sign-in.

## Notifications

A bell in the header, and `/notifications`. Fetched when a session appears and
after that only when something acts on it — there is no polling, because a
notice from the team is not something the customer is sitting waiting on.

## Not built yet

No payment step — an order is recorded as `order_is_sent` for the team to
follow up.
