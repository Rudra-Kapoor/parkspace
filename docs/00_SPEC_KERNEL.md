# ParkSpace — Specification Kernel

> This is the single source of truth. Every other document and every line of code
> derives from the decisions recorded here. If a document contradicts this file,
> this file wins.

## 1. One-sentence definition

ParkSpace is a two-sided marketplace that lets people and businesses monetise unused
parking capacity, and lets drivers discover, reserve, pay for and access a guaranteed
parking space before they arrive.

## 2. Product pillars

| Pillar | Meaning |
| --- | --- |
| Guaranteed inventory | A confirmed booking is a hard reservation. Double-booking must be structurally impossible, not merely unlikely. |
| Trust | Verified hosts, verified spaces, two-sided reviews, dispute resolution, audit trail. |
| Flexibility | Hourly, daily, overnight, monthly, recurring and event bookings on one inventory model. |
| Density | Success is supply density inside a neighbourhood, not national listing count. |

## 3. North Star Metric

**Successfully completed parking hours per week.**

Every other metric is a supporting metric. See `28_Analytics_Requirements.md`.

## 4. Roles

| Role | Enum value | Capability |
| --- | --- | --- |
| Driver | `driver` | Search, book, pay, check in and out, review, raise disputes |
| Host | `host` | List spaces, set availability and price, accept bookings, withdraw earnings |
| Operator | `operator` | Multi-location host with staff seats and gate control |
| Admin | `admin` | Moderation, verification, refunds, disputes, configuration |
| Support | `support` | Read-only admin plus dispute handling |

One account may hold `driver` and `host` at the same time. The active role sits on
`profiles.role`, and the full set sits in the `profiles.roles` array.

## 5. Technology decisions and why

| Layer | Choice | Rationale |
| --- | --- | --- |
| Framework | Next.js 15 App Router with TypeScript | One deployable unit for marketing pages, app UI and API routes. Free on Vercel. |
| Database | Supabase Postgres | The supplied infrastructure is Supabase. Postgres also solves the hardest problem in this product natively, see section 6. |
| Auth | Supabase Auth, email OTP plus password | Row Level Security binds directly to `auth.uid()`. |
| Storage | Supabase Storage | Space photos, verification documents and dispute evidence, each with its own bucket policy. |
| Maps | MapLibre GL JS with OpenStreetMap raster tiles | The free and open alternative to Google Maps. No key, no billing account, no quota card. |
| Geocoding | Nominatim, proxied server side and cached | Free. Proxying lets us set a compliant User-Agent and respect the one request per second policy. |
| Directions | OSRM public API with an OpenStreetMap deep link fallback | Free. |
| Payments | Provider abstraction with a zero-config mock and a Razorpay adapter | The whole booking loop is demonstrable for free. A real gateway becomes a config change. |
| Styling | Tailwind CSS v4 | No runtime and no licence cost. |
| Charts | Recharts | Admin analytics. |
| Tests | Vitest | Pricing, availability and policy logic are pure functions and are unit tested. |
| Hosting | Vercel free tier | |

### Deviation from the original brief, stated plainly

The original brief assumed a MERN stack on MongoDB. The infrastructure actually
supplied is Supabase, which is Postgres. We use Postgres deliberately, because the
core correctness requirement of this product, never selling the same space twice over
overlapping time, is a native one-line guarantee in Postgres and an application-level
race condition in MongoDB. Section 6 shows the mechanism. The React front end from the
original brief is unchanged.

## 6. The central technical guarantee

A parking space is a resource reserved over an interval of time. Postgres models that
directly with a range type and a GiST exclusion constraint.

```sql
period tstzrange GENERATED ALWAYS AS (tstzrange(starts_at, ends_at, '[)')) STORED,

CONSTRAINT bookings_no_overlap EXCLUDE USING gist (
  space_id  WITH =,
  bay_index WITH =,
  period    WITH &&
) WHERE (status IN ('pending','confirmed','active'))
```

Two concurrent transactions that try to reserve overlapping intervals on the same bay
of the same space cannot both commit. The loser receives an exclusion violation, which
the booking service translates into a clean `SPACE_NO_LONGER_AVAILABLE` response. No
application-level locking, no advisory locks, no optimistic retry loop, no race.

A space with several bays carries `capacity > 1`. A booking holds one specific
`bay_index`, so the constraint covers the triple rather than the pair.

Pending holds take part in the constraint, so a space is locked while the driver is on
the payment screen. A hold expires after `BOOKING_HOLD_MINUTES`, default 10, through a
scheduled job that releases the interval.

## 7. Money model

Amounts are stored as integer paise in a `bigint`. Never floats. Currency is INR.

```
base_amount      = f(price model, duration, dynamic multiplier)
discount_amount  = coupon + wallet credit
taxable_amount   = base_amount - discount_amount
service_fee      = round(taxable_amount * DRIVER_SERVICE_FEE_PCT)
tax_amount       = round(service_fee * GST_PCT)
total_amount     = taxable_amount + service_fee + tax_amount
host_commission  = round(taxable_amount * HOST_COMMISSION_PCT)
host_payout      = taxable_amount - host_commission
platform_revenue = service_fee + host_commission
```

Defaults, every one of them changeable at runtime through `platform_settings`.

| Key | Default |
| --- | --- |
| `HOST_COMMISSION_PCT` | 0.10 |
| `DRIVER_SERVICE_FEE_PCT` | 0.05 |
| `GST_PCT` | 0.18 |
| `BOOKING_HOLD_MINUTES` | 10 |
| `GRACE_PERIOD_MINUTES` | 10 |
| `MIN_BOOKING_MINUTES` | 30 |
| `MAX_BOOKING_DAYS` | 90 |

The last two are defaults for the listing wizard. What the booking engine actually
enforces is the per-space `min_booking_minutes` and `max_advance_days`, because a
global floor would override a host who legitimately wants to let a bay by the
quarter hour.

> Tax here is a placeholder, not advice. The GST treatment of a parking marketplace,
> the TDS and TCS position under section 194-O, whether the platform is an aggregator
> or a pure intermediary, and the invoicing obligation towards unregistered hosts all
> have to be settled by a chartered accountant before the platform handles real money.
> Tax is computed in exactly two places, `quote_booking()` in migration 0007 and
> `computeBreakdown()` in `src/lib/money.ts`, both reading `GST_PCT` from
> `platform_settings`. Changing the rate is a settings change, not a deploy.
> Changing the *shape* of the calculation means editing those two functions and
> their tests. See `20_Legal_Requirements.md`.

## 8. Cancellation policies

| Policy | Cancel before the cutoff | Cancel after the cutoff |
| --- | --- | --- |
| `flexible` | Full refund, cutoff is 1 hour before start | Nothing |
| `moderate` | Full refund, cutoff is 24 hours before start | Half |
| `strict` | Half, cutoff is 48 hours before start | Nothing |
| `non_refundable` | Nothing once confirmed. Monthly and event inventory only. | Nothing |

The service fee is retained when the driver cancels and refunded when the host cancels.
A host cancellation also applies a reliability penalty.

Two points that the first draft left ambiguous, now settled:

1. **`flexible` after its cutoff refunds nothing.** It is the most generous policy
   before the cutoff and the strictest after it, deliberately. A space released an
   hour before the stay can still be resold. One released ten minutes before cannot.
2. **Commission is charged only on the amount the host actually keeps.** When a
   driver forfeits part of a booking under a cancellation policy, the platform takes
   its percentage of the forfeited amount and the host keeps the rest, on the same
   split as a completed stay. The platform does not take a full commission on a
   booking that was never delivered, and the host is not paid gross on one either.

## 9. Booking state machine

```
                  ┌──────────► expired        hold timed out, no payment
                  │
draft ─► pending ─┼──────────► cancelled      driver or host, before start
                  │
                  └─► confirmed ─► active ─► completed
                           │          │          │
                           │          └──────────┴──► disputed
                           └────► no_show
```

Legal transitions are enforced by a database trigger, not only in application code.
There is no separate `reviewed` state: a review is a row in `reviews`, and the
booking stays `completed`. See `14_Booking_Engine_Specification.md`.

## 10. Location privacy rule

Before a booking is confirmed, the public API exposes only a jittered coordinate,
`approx_lat` and `approx_lng`, offset by a deterministic vector of 80 to 150 metres,
plus the street and locality. The exact coordinate, the full address, the gate number
and the access instructions are released only to a driver holding a confirmed booking,
and only from 24 hours before the booking starts. Row Level Security enforces this, not
the user interface.

## 11. MVP boundary

In scope: auth, vehicles, host onboarding, the listing wizard, photos, availability,
search, map, listing page, quote, booking, hold, payment, confirmation, QR, check-in
and check-out, overstay, cancellation, refund, two-sided reviews, messaging,
notifications, host dashboard, earnings, driver dashboard, wallet, coupons, referrals,
admin panel, moderation, disputes, audit log, analytics, legal pages and local SEO
pages.

Out of scope for the MVP: smart locks, licence plate recognition, occupancy sensors,
machine-learned pricing, EV hardware integration, valet, corporate SaaS billing, white
label, multi-country payments and native mobile apps.

## 12. First market

Kolkata. Launch neighbourhoods in priority order: Park Street, Esplanade, Camac Street,
Salt Lake Sector V, Ballygunge, New Town. The target is 150 live spaces inside a 2 km
radius before any driver acquisition spend begins. See `29_Go_To_Market.md`.
