# ParkSpace

**An Airbnb for parking.** People and businesses list unused driveways, garages and
bays. Drivers find, reserve, pay for and access a guaranteed space before they set off.

Built on a free tier from top to bottom: Next.js on Vercel, Supabase Postgres,
MapLibre with OpenStreetMap tiles, and a payment layer that runs the complete booking
loop with no merchant account.

**Live:** https://parkspace-nine.vercel.app

94 assertions pass against the live database, including the one that matters: 24
concurrent transactions aimed at a single parking bay, exactly one of which commits.

---

## The idea in one paragraph

Parking is not scarce so much as badly allocated. A driveway in Ballygunge sits empty
from nine to six while someone circles Park Street looking for a space. An office car
park empties at seven, a restaurant's bays are unused until lunchtime, a shop's yard is
free all night. ParkSpace connects the two sides, takes 10 percent of each booking from
the host and 5 percent from the driver, and guarantees that a confirmed booking is a
real reservation rather than a hopeful one.

---

## Why this repository is worth reading

Most marketplace demos handle the happy path. The interesting parts of this one are the
unhappy ones.

**Double-booking is structurally impossible, not merely unlikely.** A booking holds a
time range on a specific bay, and Postgres enforces non-overlap with a GiST exclusion
constraint. Two concurrent transactions for the same bay cannot both commit. The loser
gets a clean "someone just booked this" message rather than a second sale of the same
space. There is no application lock, no retry loop and no race.

**The exact address is protected by the database, not by the user interface.** The
browser roles have `SELECT` revoked on the spaces table entirely and are granted a
column list that omits the address, the true coordinate and the access instructions.
Those reach a driver only through a view that checks for a confirmed booking, and only
from 24 hours before the stay. A careless query cannot leak a home address because the
grant does not exist.

**Money is integer paise everywhere**, with a guard that rejects a non-integer outright,
because the bug it exists to catch is someone passing `12.5` meaning rupees.

**The mock payment provider signs its webhooks properly.** It is not a stub that returns
success. The signature verification, replay deduplication and confirmation code
exercised on a laptop is the same code that runs in production.

---

## Getting it running

### What you need

- Node 20 or newer
- A free Supabase account
- Nothing else. No Google Maps key, no merchant account, no credit card.

### 1. Install

```bash
npm install
```

### 2. Create a Supabase project

Go to [supabase.com/dashboard](https://supabase.com/dashboard) and create a free
project. Once it finishes provisioning, open **Project Settings, API** and copy:

- the Project URL
- the `anon` public key
- the `service_role` secret key

### 3. Configure

```bash
cp .env.example .env.local
```

Fill in the three Supabase values. Every other variable has a working default.

> The `service_role` key bypasses every Row Level Security policy in the database.
> Never prefix it with `NEXT_PUBLIC_`, never import it into a client component, and
> never paste it into a chat or a screenshot. If it leaks, rotate it immediately under
> Project Settings, API.

### 4. Create the schema

Get a personal access token from
[supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens),
then:

```bash
# macOS and Linux
SUPABASE_ACCESS_TOKEN=sbp_your_token npm run db:push

# Windows PowerShell
$env:SUPABASE_ACCESS_TOKEN="sbp_your_token"; npm run db:push
```

This applies all fourteen migrations through the Supabase Management API. No Docker, no
local Postgres, no CLI install. It is safe to run twice: applied files are skipped.

### 5. Add demo data

```bash
npm run db:seed
```

Creates five hosts with real Kolkata listings, two drivers with vehicles, and an admin.
It prints the sign-in credentials when it finishes.

### 6. Run it

```bash
npm run dev
```

Open [localhost:3000](http://localhost:3000).

---

## Trying the whole loop

The seed data lets you walk the complete flow in about two minutes.

1. Sign in as `arindam.driver@parkspace.demo` using the **password** option, not the
   magic link, since these addresses do not receive email. The password is printed by
   the seed script.
2. Search for **Park Street, Kolkata**. Pick a time window.
3. Open a listing. Notice the map shows a dashed circle, not a pin: you are not yet
   entitled to the exact address.
4. Book it. The price breakdown comes from the database, not the browser.
5. At checkout, choose **Simulate a successful payment**. This posts a properly signed
   event to the real webhook endpoint, which verifies it, deduplicates it, checks the
   amount against the booking and confirms it.
6. The booking page now shows the exact address, the access instructions, the gate code
   and a QR code.
7. Press **I have arrived**, then **I am leaving**.
8. Leave a review. It stays hidden until the host writes theirs.

Then sign in as `kalpana.host@parkspace.demo` to see the same booking from the other
side, and as `admin@parkspace.demo` to see the moderation queue and the supply gap map.

---

## How it is put together

```
src/
  app/
    page.tsx                    landing page with a working search box
    search/                     map and list, server-rendered first page
    space/[id]/                 listing page, privacy-aware
    checkout/[id]/              payment, with a real hold countdown
    bookings/                   driver bookings, QR, check in and out
    host/                       host dashboard, listings, calendar, earnings
    admin/                      moderation, users, disputes, settings, audit
    parking/[city]/[area]/      neighbourhood landing pages for organic search
    legal/                      rendered from the drafts in docs/
    api/                        route handlers
  components/                   shared UI
  lib/
    money.ts                    integer paise, tested
    policy.ts                   cancellation and overstay rules, tested
    payments/                   provider abstraction, mock and Razorpay
    supabase/                   request-scoped and service-role clients
supabase/
  migrations/                   0001 to 0014, applied in order
  seed/                         reference localities and coupons
docs/                           32 specification documents
scripts/                        setup and deployment tooling
```

### The database is the product

Fourteen migrations, and the ordering matters.

| File | What it establishes |
| --- | --- |
| `0001` | `btree_gist`, the domain enums, distance helpers |
| `0002` | Profiles auto-provisioned from auth, vehicles, host profiles |
| `0003` | Listings, photos, availability rules, blackouts, price overrides |
| `0004` | **Bookings and the exclusion constraint** |
| `0005` | Payments, refunds, payouts, reviews, messages, disputes, wallet, audit |
| `0006` | The availability engine, pricing and search |
| `0007` | Transactional booking operations |
| `0008` | **Row Level Security** |
|  | The forfeit split on cancellation |
|  | Guard triggers that were blocking every booking operation |
|  | A host can read why their listing was rejected |
|  | The price cap across every offered rate, and trust scoring |
|  | Holds expire on demand, so availability never waits on cron |
|  | **The read path, which was broken for every unprivileged user** |

The constraint in `0004` is the one that matters:

```sql
exclude using gist (
  space_id  with =,
  bay_index with =,
  period    with &&
) where (status in ('pending', 'confirmed', 'active'))
```

Pending holds participate, so a bay is locked while the driver is on the payment screen.
The range is half-open, so a booking ending at 14:00 does not collide with one starting
at 14:00, which is correct for parking: the outgoing car leaves as the incoming one
arrives.

---

## Tests

Three suites, 94 assertions.

```bash
npm test               # 49 unit tests, pure functions, no database
npm run test:concurrency  # 17 checks against a live Postgres
npm run test:flow         # 28 checks as a real signed-in driver
```

The unit tests cover the two things that must never be wrong, the money and the
cancellation policy, including randomised invariant checks over 400 combinations of
amount, policy, cancelling party and timing.

The other two need a database, and they exist because the most serious bug in this
project so far was invisible to anything that ran with elevated privileges. The
concurrency suite proves the exclusion constraint holds under real parallelism and that
the privacy grant holds for an anonymous client. The flow suite signs in as a seeded
driver and drives search, quote, hold, confirm and cancel at the privilege level a real
user has, then tries to escalate its own role, credit its own wallet and insert a
booking directly. All three are refused.

```bash
npm run typecheck     # tsc --noEmit
npm run verify        # both
```

---

## Deploying

```bash
npm run deploy
```

Or manually: push to GitHub, import the repository at
[vercel.com/new](https://vercel.com/new), add the same environment variables, deploy.
Vercel detects Next.js and the cron schedule in `vercel.json` automatically.

After the first deploy:

1. Set `NEXT_PUBLIC_SITE_URL` to the real domain and redeploy.
2. Set `CRON_SECRET` so the scheduled sweepers are not publicly callable.
3. In Supabase, under Authentication, URL Configuration, add the domain to the redirect
   allowlist.

Full detail is in [`docs/27_Deployment_Strategy.md`](docs/27_Deployment_Strategy.md).

---

## Payments

The default provider is `mock`, which runs the complete flow with no merchant account.
It refuses to start in production unless you explicitly set `ALLOW_MOCK_PAYMENTS=true`,
because a deployment that confirms bookings without taking money sells parking it cannot
pay hosts for.

To use a real gateway, set `PAYMENT_PROVIDER=razorpay` with test-mode keys and point a
webhook at `/api/payments/webhook` for `payment.captured`, `payment.failed` and
`payment.authorized`.

---

## What is deliberately not finished

Being straight about this matters more than looking complete.

**Money leaves the system in one direction only.** Payments in work end to end. Nothing
that pays money out is connected, and these three gaps are related:

| Gap | What actually happens |
| --- | --- |
| Refunds | `cancel_booking` computes the split correctly and writes a `refunds` row at `requested`. Neither provider's `refund()` is ever called, so no money returns. A human would have to refund from the gateway dashboard and mark the row. |
| Payouts | `payable_balance_paise` only ever increases. The cron counts payable bookings and stops there. No payout is created and no money reaches a host. |
| Extensions | `extend_booking` adds the extra time to the booking total but creates no payment intent, so an extension is currently free to the driver. |
| Overstay | Charged and recorded on checkout. Never collected. And the auto-complete sweeper back-dates `checked_out_at` to the original end, so a driver who overstays and never taps checkout is billed nothing at all. |

Everything else:

| Area | State |
| --- | --- |
| Notification delivery | Rows are queued with correct scheduling and deduplication. Nothing is actually sent. No email, SMS, push or WhatsApp provider is wired up. |
| Photo upload | The schema and display path are complete. The upload UI is not built, so seeded listings have no photos. |
| KYC document upload | The table and policies exist. The upload flow is not built. |
| Rate limiting | In-process and per-instance, so on serverless the real limit is the configured limit times the number of warm instances. Fine against a loop, useless against a distributed attack. |
| Realtime | Checkout polls for confirmation rather than subscribing. Simpler and adds no failure mode. |
| Legal documents | Drafts for a lawyer to settle, carrying 96 REVIEW REQUIRED markers. Not publishable as they stand. |
| Tax treatment | An 18 percent placeholder read from `platform_settings`, applied in two places. A chartered accountant has to settle the real position before this handles real money. |
| Concurrency proof | Done. 24 parallel transactions at one bay, exactly one commits. Run `npm run test:concurrency`. |

---

## The documents

Thirty-two specifications in [`docs/`](docs/), around 130,000 words.

[`00_SPEC_KERNEL.md`](docs/00_SPEC_KERNEL.md) is the single source of truth: if a
document and the kernel disagree, the kernel wins.

| Group | Documents |
| --- | --- |
| Product | Vision, PRD, personas, journeys, functional and non-functional requirements |
| Business | Business model, market research, competitive analysis, go-to-market, pitch |
| Technical | Architecture, database design, API, auth, booking engine, payments, notifications, admin |
| Operations | MVP roadmap, testing, deployment, analytics |
| Legal | Requirements, host terms, driver terms, refund policy, privacy policy, security, privacy |

---

## Security

- Row Level Security is the authorisation boundary. Not the UI, not the API route.
- The service role key is server-only and guarded by a function that throws if it is
  ever evaluated in a browser bundle.
- Webhook signatures are verified over raw request bytes in constant time.
- The payment amount is read from the booking row, never from the request.
- Secrets are git-ignored from the very first commit.

If you find something, please open an issue rather than a pull request.

---

## Licence

MIT. See [LICENSE](LICENSE).

Map data © OpenStreetMap contributors, available under the
[Open Database License](https://www.openstreetmap.org/copyright).
