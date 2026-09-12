# 10. System Architecture

> This document describes the system as it exists in this repository, not an
> aspirational design. Where something is incomplete it is labelled a limitation
> rather than described as if it were finished. Section 9 is the list of things
> that are knowingly unfinished.

## 1. One sentence

ParkSpace is a single Next.js 15 App Router application deployed on Vercel,
talking to one Supabase Postgres database whose Row Level Security policies are
the actual authorisation boundary, with maps from OpenStreetMap, geocoding
proxied through our own route, payments behind a two-implementation provider
interface, and one Vercel Cron job driving all scheduled work.

## 2. Runtime topology

| Component | What it is | Where it runs | Credential it holds |
| --- | --- | --- | --- |
| Marketing and app UI | Next.js App Router Server Components and Client Components | Vercel edge network plus Node serverless functions | Anon key only, in the browser bundle |
| API route handlers | Files under `src/app/api/**/route.ts`, all pinned to `export const runtime = 'nodejs'` | Vercel Node serverless functions | Anon key by default; service role in four specific routes |
| Middleware | `src/middleware.ts` calling `updateSession` | Vercel Edge Middleware, runs on nearly every request | Anon key |
| Database | Supabase Postgres with `btree_gist`, `pgcrypto`, `pg_trgm` | Supabase managed instance | n/a |
| Auth | Supabase Auth, magic link plus password | Supabase managed | n/a |
| Storage | Supabase Storage buckets for space photos, verification documents, dispute evidence | Supabase managed | Referenced by path only; the schema stores `storage_path`, never bytes |
| Map tiles | `a/b/c.tile.openstreetmap.org` raster, Carto light as an alternate style | Third party, called from the browser | None, no key exists |
| Geocoding | Nominatim, reached only through `/api/geocode` | Third party, called server side | A User-Agent string, not a key |
| Payments | `MockPaymentProvider` or `RazorpayProvider` behind `PaymentProvider` | Vercel Node function | Razorpay key id, key secret, webhook secret |
| Scheduler | Vercel Cron, `*/5 * * * *` from `vercel.json`, hitting `GET /api/cron` | Vercel | `CRON_SECRET` bearer token |

There is no separate API server, no message broker, no Redis, no worker fleet and
no container. The entire deployable unit is one Next.js project.

## 3. Request flow

```
                          BROWSER (anon key only)
  ┌──────────────────────────────────────────────────────────────────────┐
  │  React 19 client components, MapLibre GL, checkout sheet             │
  │  supabase-js browser client  ──── anon key, RLS applies ────┐        │
  └───────────┬──────────────────────────────────────────────────┼───────┘
              │ HTTPS                                            │
              ▼                                                  │
  ┌──────────────────────────────────────────────────────────┐   │
  │  VERCEL EDGE MIDDLEWARE  src/middleware.ts               │   │
  │   • updateSession(): supabase.auth.getUser()             │   │
  │   • rotates the auth cookies onto the response           │   │
  │   • redirects signed-out users away from /host, /admin,  │   │
  │     /bookings, /checkout   (convenience, not security)   │   │
  └───────────┬──────────────────────────────────────────────┘   │
              ▼                                                  │
  ┌──────────────────────────────────────────────────────────┐   │
  │  NEXT.JS NODE FUNCTIONS  (Server Components + /api/*)    │   │
  │                                                          │   │
  │  createClient()        anon key + user cookie  ──────────┼───┤
  │     search, quote, bookings, cancel, checkin, checkout,  │   │
  │     extend, host/*, reviews/respond                      │   │
  │                                                          │   │
  │  createServiceClient()  SERVICE ROLE, bypasses ALL RLS   │   │
  │     /api/payments/webhook   /api/cron                    │   │
  │     /api/payments/create  (payments insert only)         │   │
  │     /api/host/spaces      (role promotion only)          │   │
  └───────────┬──────────────────────────┬───────────────────┘   │
              │                          │                       │
              │ PostgREST / RPC          │ outbound              │
              ▼                          ▼                       ▼
  ┌───────────────────────────┐  ┌──────────────────┐   ┌────────────────┐
  │  SUPABASE POSTGRES        │  │ Nominatim        │   │ OSM / Carto    │
  │   RLS on 26 tables        │  │ (1 req/sec queue │   │ raster tiles   │
  │   bookings_no_overlap     │  │  + 24h cache)    │   │ (browser only) │
  │   SECURITY DEFINER RPCs   │  └──────────────────┘   └────────────────┘
  │   public_spaces view      │  ┌──────────────────┐
  │   public_profiles view    │  │ Razorpay REST    │
  └───────────▲───────────────┘  └────────┬─────────┘
              │                           │ webhook POST
              │  service role             │
  ┌───────────┴───────────────┐  ┌────────▼──────────────────────────────┐
  │ VERCEL CRON  */5 * * * *  │  │ /api/payments/webhook                 │
  │ GET /api/cron             │  │  raw bytes → HMAC verify → record →   │
  │  Bearer CRON_SECRET       │  │  dedupe on (provider, event_id) →     │
  │  expire holds, complete,  │  │  amount check → confirm_booking()     │
  │  publish reviews, badges, │  │  → queue notification rows            │
  │  mark notifications sent  │  └───────────────────────────────────────┘
  └───────────────────────────┘
```

The booking happy path, end to end:

```
1.  GET  /api/search            → rpc search_spaces()            anon ok
2.  POST /api/quote             → rpc quote_booking()            anon ok
3.  POST /api/bookings          → rpc create_booking_hold()      auth required
        └─ inserts status='pending', hold_expires_at = now()+10m
        └─ the GiST exclusion constraint reserves the bay HERE
4.  POST /api/payments/create   → provider.createIntent()        auth required
        └─ service role inserts a payments row, status='created'
5.  browser opens the gateway sheet (or the mock demo sheet)
6.  gateway → POST /api/payments/webhook                          unauthenticated,
        └─ signature verified over the raw bytes                  signature-gated
        └─ rpc confirm_booking()  ⇒ status='confirmed'
7.  browser polls GET /api/bookings every 2s for up to 30s
```

Only step 6 may move a booking to `confirmed`. The browser callback in step 5 is
treated as a hint about what to render, never as proof of payment.

## 4. Trust boundaries and privilege

There are exactly three privilege levels in this system.

| Level | Key | Who gets it | Enforced by |
| --- | --- | --- | --- |
| Anonymous | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Every browser, shipped in the bundle | RLS policies for the `anon` role |
| Authenticated user | The same anon key plus a verified JWT in a cookie | A signed-in person, server and browser alike | RLS policies evaluated against `auth.uid()` |
| Service role | `SUPABASE_SERVICE_ROLE_KEY` | Four server-side call sites, never the browser | Nothing. It bypasses every policy. |

`src/lib/env.ts` makes the third level hard to leak: `serverEnv()` throws
immediately if `typeof window !== 'undefined'`, and the service key is never
exposed under a `NEXT_PUBLIC_` name, so Next.js cannot inline it into a client
bundle.

The complete list of service-role call sites in this build:

| Route | Why it needs the service role |
| --- | --- |
| `POST /api/payments/webhook` | The caller is a gateway with no user session. It must write `webhook_events` and `payments`, both of which are closed to clients, and call `confirm_booking`, which is explicitly revoked from `anon` and `authenticated`. |
| `GET /api/cron` | Sweepers operate across every user's rows. `expire_stale_holds`, `auto_complete_stale_bookings` and `refresh_superhost_badges` are all revoked from client roles. |
| `POST /api/payments/create` | Inserts into `payments`, which only a full admin may write under RLS. It also calls `confirm_booking` directly for the zero-amount case where a wallet fully covers the booking. |
| `POST /api/host/spaces` | Promotes a driver account to `host`. `profiles.role` is reset to its old value by the `profiles_guard_privileged` trigger for anyone who is not a full admin. The code comments note this is best effort, because that trigger exempts only a full admin and so can defeat even the service-role write path depending on how `is_full_admin()` evaluates for a service-role session. The listing is created either way. |

Everything else, including every host route and every booking operation, runs
through `createClient()` with the caller's own session. `src/app/api/host/spaces/[id]/route.ts`
states the principle directly: it does not add a redundant `eq('host_id', ...)`
filter, because RLS already scopes the statement and a redundant filter would
imply the policy is not trusted.

The second boundary is column-level rather than row-level. Migration 0008 does
this:

```sql
revoke select on parking_spaces from anon, authenticated;
grant select (id, slug, host_id, title, ... ) on parking_spaces to authenticated;
grant select on public_spaces to anon, authenticated;
```

The browser role literally has no privilege to select `address_line`, `lat`,
`lng`, `access_instructions` or `access_pin` from the base table. It reads the
`public_spaces` view, which returns those columns only when
`has_address_access(space_id)` is true. The location privacy rule is therefore a
grant, not a `select` list somebody has to remember to write correctly.

## 5. Where state lives

| State | Home | Durable | Notes |
| --- | --- | --- | --- |
| Everything transactional | Supabase Postgres | Yes | 26 RLS-protected tables plus `seo_localities` from the seed |
| Sessions | HTTP-only cookies, verified against Supabase Auth | Yes | Refreshed by middleware on every matched request |
| Files | Supabase Storage | Yes | Only the path is in Postgres |
| Rate limit counters | `Map` in `src/lib/rate-limit.ts` | **No** | Per instance, lost on cold start |
| Geocode cache | `Map` in `src/app/api/geocode/route.ts`, 500 entries, 24 h TTL | **No** | Per instance |
| Nominatim pacing queue | Module-level promise chain in the same file | **No** | Per instance, so the 1 req/sec policy holds per instance, not globally |
| Payment provider instance | Module singleton in `src/lib/payments/index.ts` | **No** | Cheap to rebuild |

The only durable store is Postgres. Everything in-process is a cache or a
counter, and every one of them is correct-but-weaker when a cold start discards
it. Nothing in the booking path depends on in-process state, which is the
property that makes a stateless serverless deployment safe here.

## 6. Why a modular monolith rather than microservices

The correctness requirement of this product is that two drivers never hold the
same bay over overlapping time. That guarantee is implemented as a single GiST
exclusion constraint inside one Postgres table. A microservice split would put
inventory, pricing, payment and identity behind separate network hops with
separate stores, and the guarantee would immediately degrade into a distributed
transaction problem solved with sagas, compensation and eventual consistency.
The product would gain operational complexity and lose the one property it
cannot compromise on.

The concrete arguments, in the order they actually mattered:

1. **The constraint must be local.** `bookings_no_overlap` works because the
   booking row, the hold and the confirmed reservation all live in one table in
   one database. Split the booking service from the inventory service and the
   constraint cannot be written.
2. **One transaction, not two round trips.** Every money-and-state operation is
   a single `SECURITY DEFINER` function in migration 0007: `create_booking_hold`,
   `confirm_booking`, `cancel_booking`, `check_in_booking`, `check_out_booking`,
   `extend_booking`. The file header states the reason plainly: a partial failure
   between two round trips is how a driver ends up charged for a booking that
   does not exist.
3. **RLS only protects what it can see.** Authorisation is expressed as policies
   against `auth.uid()`. Once data leaves Postgres for another service, the
   policy stops protecting it and the protection has to be reimplemented in
   application code, which is exactly the thing this design avoids.
4. **The deployment budget is a free tier.** One Vercel project and one Supabase
   project. There is no orchestrator to run and no service mesh to debug.
5. **Modularity is preserved without a network boundary.** `src/lib/money.ts`,
   `src/lib/policy.ts`, `src/lib/payments/*`, `src/lib/geo.ts` and
   `src/lib/rate-limit.ts` are independent modules with no cross-imports beyond
   types. Payments in particular sit behind an interface with two
   implementations, which is the seam that would be cut first if the product ever
   genuinely needed to split.

## 7. Deviation from the original MERN brief

The brief assumed MongoDB with Express. The supplied infrastructure is Supabase,
which is Postgres. That forced a decision, and the decision was taken on merit
rather than on convenience.

| Brief | Built | Reason |
| --- | --- | --- |
| MongoDB | Supabase Postgres | The core guarantee, never selling a bay twice over overlapping time, is one `EXCLUDE USING gist` clause in Postgres and an application-level race in MongoDB. Range types, `tstzrange`, `btree_gist` and generated columns exist in Postgres and do not exist in Mongo. |
| Express API server | Next.js App Router route handlers | One deployable unit, no CORS surface, no second process to host, and server components can query the database directly without an HTTP hop. |
| Application-layer auth | Supabase Auth plus RLS | Authorisation moves into the database, where it protects every access path rather than only the paths that remembered to check. |
| Google Maps | MapLibre GL + OSM raster tiles | No API key, no billing account, no per-load quota. There is no key to leak because there is no key. |
| Google Geocoding | Nominatim proxied through `/api/geocode` | Free, and proxying is what allows a compliant User-Agent and a central 1-request-per-second pacing queue. |
| Stripe or similar | `PaymentProvider` interface, mock plus Razorpay | The mock signs its webhooks with HMAC, so the signature verification code that runs in production is the same code exercised on a laptop. Switching gateway is one environment variable. |
| React front end | React 19, unchanged in spirit | The one part of the brief that survived intact. |

Mongoose schemas were replaced by SQL migrations that encode domain rules as
enums, check constraints and triggers, so an invalid state is unrepresentable
rather than merely discouraged.

## 8. Cross-cutting concerns

**Validation.** Every trust boundary parses input through a Zod schema in
`src/lib/validation.ts`. The same schemas are imported by client forms and server
routes, so the rules cannot drift.

**Errors.** `src/lib/errors.ts` holds a closed `AppErrorCode` union with a
catalogue mapping each code to user-facing copy, an HTTP status and a retryable
flag. Database functions return `{ok:false, error:'CODE'}`, routes pass the code
through `isAppErrorCode()` and render the catalogue entry. Nothing between the
database and the screen invents its own wording.

**Rate limiting.** Seven named limit classes in `src/lib/rate-limit.ts`. Applied
today on `/api/quote`, `/api/bookings` and `/api/payments/create` only.

**Security headers.** `next.config.mjs` sets a CSP, HSTS with preload,
`X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy` and a Permissions-Policy
that allows geolocation for self and nothing else.

**Analytics.** `/api/search` writes a `search_events` row on every search, fire
and forget, with both promise branches swallowed so analytics can never break a
search. A zero-result row is the demand signal that drives supply acquisition.

## 9. Known architectural limitations

These are real and current. None of them is hidden behind optimistic wording.

| # | Limitation | Consequence | Fix |
| --- | --- | --- | --- |
| 1 | **The rate limiter is an in-process fixed-window counter.** `WINDOWS` is a `Map` in module scope. | On Vercel each warm instance keeps its own counters, so the effective limit is the configured limit multiplied by the number of instances. It stops one client in a loop; it is not a defence against a distributed attack. | Upstash Redis or Vercel's own edge rate limiting, keeping the same `LIMITS` table. |
| 2 | **The notification worker does not deliver anything.** Step 5 of `/api/cron` runs `update({sent_at: now}).is('sent_at', null).lte('send_after', now)`. | Rows are marked sent without an email, SMS, push or WhatsApp ever being attempted. There is no provider wired up at all. The code comment says so. | See `16_Notification_Specification.md`. |
| 3 | **The geocode cache and the Nominatim pacing queue are per instance.** | Under fan-out the application can exceed the one-request-per-second policy of a service run on donated infrastructure. | A shared cache, or a self-hosted Nominatim before real traffic. |
| 4 | **Rate limiting is not applied to every route.** `/api/search`, `/api/geocode`, `/api/bookings/[id]/*`, `/api/host/*` and `/api/reviews/[id]/respond` call no limiter, even though `LIMITS.search`, `LIMITS.geocode` and `LIMITS.message` exist. | The most scrape-prone endpoint, search, and the endpoint that calls a third party, geocode, are both unlimited. | Wrap them with the existing helper. |
| 5 | **The CSP blocks the Razorpay checkout script.** `script-src` is `'self' 'unsafe-inline' 'unsafe-eval'`, and `checkout-client.tsx` injects a `<script src="https://checkout.razorpay.com/v1/checkout.js">`. | Under the configured CSP the real gateway sheet would fail to load in production. | Add `https://checkout.razorpay.com` to `script-src` and `https://api.razorpay.com` to `connect-src` before switching provider. |
| 6 | **No PostGIS.** Distance is haversine in SQL over a bounding-box prefilter, indexed by `spaces_geo_idx on (lat, lng)`. | Fine at city scale, degrades at national scale. Deliberate: the schema runs on any plain Postgres. | PostGIS and a GiST geography index when the dataset outgrows one city. |
| 7 | **The admin panel is a shell only.** `src/app/admin/layout.tsx` exists with a nine-item nav and a working role gate. Every page it links to, and every route under `src/app/api/admin/`, is an empty directory at the time of writing. | Admin navigation leads to 404s. | See `17_Admin_Panel_Specification.md`. |
| 8 | **`npm run setup` is broken.** `package.json` declares `"setup": "node scripts/setup.mjs"` and `scripts/setup.mjs` does not exist. | The documented setup command fails. | Remove the script entry or add the file. |
| 9 | **Payout execution does not exist.** The `payouts` and `payout_items` tables exist and `host_profiles.payable_balance_paise` is maintained, but nothing creates a payout row and no provider payout API is called. Cron step 6 only counts payable bookings. | Hosts accrue a balance that is never paid out by the system. | See `15_Payment_Specification.md`. |
| 10 | **Refund execution is partial.** `cancel_booking` inserts a `refunds` row with `status='requested'` and records the split. Neither `MockPaymentProvider.refund()` nor `RazorpayProvider.refund()` is called from anywhere in the application. | Refunds are recorded, not issued. | An admin refund action or a cron step that drains `refunds where status='requested'`. |
| 11 | **The browser polls for confirmation.** `checkout-client.tsx` polls `/api/bookings` every 2 s for 15 attempts. | Up to 30 seconds of uncertainty, and after that the user sees a "do not pay again" message. | Supabase Realtime on the bookings row. The code comment names this as the natural V2 improvement and notes it adds a failure mode for no correctness gain. |
| 12 | **Single region.** One Vercel region and one Supabase region. | Latency outside India, and no failover. | Acceptable for a Kolkata-first launch, and stated rather than assumed. |

## 10. What the architecture buys

The design is unusual in one respect worth naming: a large fraction of the
business logic lives in SQL rather than TypeScript. Pricing, availability,
refund policy, the state machine, the counters and the aggregates are all
database functions and triggers. That decision costs testability, which
`26_Testing_Strategy.md` addresses head on, and buys three things that matter
more for this product: every access path is subject to the same rules, an
operation that touches money and state is one transaction rather than two round
trips, and the concurrency guarantee is structural rather than defensive.
