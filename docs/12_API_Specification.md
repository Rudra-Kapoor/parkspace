# 12. API Specification

> Every route documented here exists as a file under `src/app/api/` or
> `src/app/auth/`. The admin area is under active construction; section 7 lists
> exactly what is present and what is not. All routes declare
> `export const runtime = 'nodejs'` and, except `/api/geocode`, also
> `export const dynamic = 'force-dynamic'`.

## 1. Conventions

### Authentication

Authentication is a Supabase session cookie, read server side with
`supabase.auth.getUser()`. There is no bearer-token API. The one exception is
`GET /api/cron`, which uses a static bearer secret, and
`POST /api/payments/webhook`, which is unauthenticated and gated by an HMAC
signature instead.

| Symbol | Meaning |
| --- | --- |
| public | No session needed |
| session | `getUser()` must return a user, else 401 `NOT_AUTHENTICATED` |
| owner | Session plus the row must belong to the caller, enforced by RLS or by the RPC reading `auth.uid()` |
| admin | `requireAdmin(['admin'])` in `src/lib/admin.ts` |
| signature | HMAC over the raw request body |
| cron secret | Constant-time comparison against `CRON_SECRET` |

### Error shape

Failures return `AppError.toResponseBody()`:

```json
{
  "ok": false,
  "error": "SPACE_NO_LONGER_AVAILABLE",
  "message": "Someone just booked this space for those times.",
  "action": "See what else is nearby",
  "retryable": false,
  "details": null
}
```

Validation failures add a `fields` object mapping the dotted field path to one
message. The HTTP status comes from `ERROR_CATALOGUE` in `src/lib/errors.ts`, so
a code always carries the same status.

| Code family | Status |
| --- | --- |
| `NOT_AUTHENTICATED` | 401 |
| `NOT_AUTHORIZED`, `ACCOUNT_SUSPENDED`, `EMAIL_NOT_VERIFIED`, `VEHICLE_NOT_YOURS` | 403 |
| `SPACE_NOT_FOUND`, `BOOKING_NOT_FOUND`, `PAYMENT_NOT_FOUND` | 404 |
| `VALIDATION_FAILED` and every `COUPON_*`, `NOT_AN_EXTENSION`, `INVALID_TIME_RANGE`, `DURATION_TOO_*`, `STARTS_IN_PAST`, `SIGNATURE_INVALID`, `INSUFFICIENT_WALLET`, `VEHICLE_REQUIRED` | 400 |
| `PAYMENT_FAILED` | 402 |
| Every conflict: `SPACE_NOT_ACTIVE`, `SPACE_NOT_AVAILABLE`, `SPACE_NO_LONGER_AVAILABLE`, `CANNOT_BOOK_OWN_SPACE`, `CANNOT_PRICE`, `VEHICLE_DOES_NOT_FIT`, `VEHICLE_TYPE_NOT_ACCEPTED`, `BOOKING_NOT_PENDING`, `NOT_CANCELLABLE`, `NOT_CHECKINABLE`, `NOT_CHECKED_IN`, `TOO_EARLY`, `HOLD_EXPIRED_AND_TAKEN`, `EXTENSION_BLOCKED`, `EXTENSION_LIMIT_REACHED` | 409 |
| `RATE_LIMITED` | 429 |
| `UNKNOWN` | 500 |
| `UPSTREAM_UNAVAILABLE`, `NOT_CONFIGURED` | 503 |

### Rate limit classes

Defined in `src/lib/rate-limit.ts`. Keyed by `user:<id>` when signed in, else
`ip:<first x-forwarded-for entry>`. Applied responses carry
`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` and, on a
rejection, `Retry-After`.

| Class | Limit | Window | Applied today on |
| --- | --- | --- | --- |
| `search` | 60 | 60 s | **nothing** |
| `geocode` | 20 | 60 s | **nothing** |
| `quote` | 40 | 60 s | `POST /api/quote` |
| `booking` | 8 | 60 s | `POST /api/bookings` |
| `payment` | 10 | 60 s | `POST /api/payments/create` |
| `message` | 30 | 60 s | **nothing** |
| `auth` | 6 | 60 s | **nothing**, Supabase Auth applies its own |

That four of the seven classes are defined but unused is a real gap, recorded in
`10_System_Architecture.md` section 9. The limiter is also per instance, so the
effective ceiling is the stated limit times the number of warm instances.

---

## 2. Discovery

### GET /api/search

| | |
| --- | --- |
| Auth | public |
| Rate limit | none applied |
| Source | `src/app/api/search/route.ts` |

Query parameters, parsed by `searchParamsSchema`. `space_types` and `amenities`
are repeated parameters, collected with `getAll()`.

| Parameter | Type | Default | Rule |
| --- | --- | --- | --- |
| `lat` | number | required | -90..90 |
| `lng` | number | required | -180..180 |
| `radius_m` | int | 1500 | 100..10000 |
| `starts_at`, `ends_at` | ISO datetime | optional | `ends_at` must be after `starts_at` |
| `vehicle_type` | enum | optional | one of the six vehicle types |
| `max_price_paise` | int >= 0 | optional | |
| `space_types` | repeated enum | optional | |
| `amenities` | repeated string <= 40 | optional | max 15 |
| `min_rating` | number 0..5 | optional | |
| `instant_only`, `ev_only` | boolean | false | |
| `sort` | enum | `relevance` | `relevance`, `distance`, `price_asc`, `price_desc`, `rating` |
| `limit` | int | 60 | 1..200 |
| `offset` | int | 0 | |
| `q` | string <= 120 | optional | Recorded in `search_events.query_text`. It is **not** passed to `search_spaces`, so it does not filter results today |

Delegates to `search_spaces()` and then writes a `search_events` row fire and
forget, with both promise branches swallowed so analytics can never break a
search.

**Response 200**

```json
{
  "ok": true,
  "results": [ { "id": "…", "title": "Covered driveway off Middleton Row",
                 "approx_lat": 22.5522, "approx_lng": 88.3527, "distance_m": 214,
                 "free_bays": 1, "quoted_base_paise": 15000, "total_count": 7 } ],
  "total": 7,
  "centre": { "lat": 22.5524, "lng": 88.352 },
  "radius_m": 1500
}
```

**Errors:** `VALIDATION_FAILED` 400 (with `fields`), `UNKNOWN` 500.

**Example**

```
GET /api/search?lat=22.5524&lng=88.3520&radius_m=1200
    &starts_at=2026-09-20T04:30:00Z&ends_at=2026-09-20T10:30:00Z
    &vehicle_type=sedan&sort=distance&amenities=cctv&amenities=covered
```

### GET /api/geocode

| | |
| --- | --- |
| Auth | public |
| Rate limit | none applied |
| Source | `src/app/api/geocode/route.ts` |

| Parameter | Rule |
| --- | --- |
| `q` | Under 3 characters returns `{"results":[]}` with 200. Over 200 characters returns `QUERY_TOO_LONG` 400 |
| `viewbox` | Optional bias rectangle, passed to Nominatim with `bounded=0` |

The route exists because of three obligations rather than three conveniences:
Nominatim requires an identifying User-Agent that a browser cannot set; the
policy asks for at most one request per second, which only a central queue can
honour; and a shared cache means a hundred people searching "Park Street" cost
the upstream one request. Upstream calls go through `scheduleUpstream()`, a
module-level promise chain that enforces a 1100 ms gap, with an 8 second
`AbortSignal.timeout`. Results are cached for 24 hours, capped at 500 entries,
evicted oldest-first. `countrycodes=in` is fixed.

**Response 200**

```json
{ "results": [ { "displayName": "Park Street, Kolkata, West Bengal, 700016, India",
                 "lat": 22.5524, "lng": 88.3520, "type": "road",
                 "locality": "Park Street area", "city": "Kolkata",
                 "state": "West Bengal", "postcode": "700016" } ] }
```

A cache hit adds `"cached": true`. Both hit and miss set
`Cache-Control: public, max-age=3600`.

**Errors:** `QUERY_TOO_LONG` 400, `UPSTREAM_UNAVAILABLE` 502 (non-200 upstream,
network failure or timeout). Note this route returns 502, not the 503 that
`ERROR_CATALOGUE` assigns to `UPSTREAM_UNAVAILABLE`, and it returns a bare
`{results, error}` object rather than the standard error body.

---

## 3. Booking

### POST /api/quote

| | |
| --- | --- |
| Auth | public, but a session changes the answer |
| Rate limit | `quote`, 40 per minute |
| Source | `src/app/api/quote/route.ts` |

Request, `quoteRequestSchema`:

```json
{
  "space_id": "8f3c…",
  "starts_at": "2026-09-20T04:30:00Z",
  "ends_at": "2026-09-20T10:30:00Z",
  "coupon_code": "PARK20",
  "use_wallet": false
}
```

Passes `p_user_id: user?.id ?? null` so coupon eligibility and wallet balance are
evaluated for the caller when there is one. Returns the raw `quote_booking()`
JSONB unchanged.

**Response 200** (the `Quote` shape in `src/lib/types.ts`)

```json
{
  "ok": true, "available": true, "free_bays": 1, "currency": "INR",
  "duration_minutes": 360,
  "base_amount_paise": 30000, "discount_amount_paise": 6000,
  "wallet_applied_paise": 0, "taxable_amount_paise": 24000,
  "service_fee_paise": 1200, "tax_amount_paise": 216,
  "total_amount_paise": 25416,
  "host_commission_paise": 2400, "host_payout_paise": 21600,
  "commission_rate_bp": 1000, "service_fee_rate_bp": 500, "tax_rate_bp": 1800,
  "coupon_code": "PARK20", "coupon_id": "…", "coupon_error": null,
  "cancellation_policy": "moderate"
}
```

A bad coupon does **not** fail the request. It returns 200 with `discount = 0`
and `coupon_error` set to one of the nine `COUPON_*` codes, so the UI can show
the price and explain the code in one round trip.

**Errors:** `RATE_LIMITED` 429, `VALIDATION_FAILED` 400, `UNKNOWN` 500. The
in-body errors `SPACE_NOT_FOUND`, `SPACE_NOT_ACTIVE` and `CANNOT_PRICE` are
returned with **HTTP 200** and `ok: false`, because the route passes the RPC
result through without inspecting it.

### POST /api/bookings

| | |
| --- | --- |
| Auth | session |
| Rate limit | `booking`, 8 per minute |
| Source | `src/app/api/bookings/route.ts` |

This is the moment inventory is reserved. Everything before it is browsing,
everything after it is payment.

Request, `bookingRequestSchema` (quote schema plus three fields):

```json
{
  "space_id": "8f3c…", "starts_at": "…", "ends_at": "…",
  "coupon_code": "", "use_wallet": false,
  "vehicle_id": "2b71…",
  "notes": "Silver Honda City",
  "idempotency_key": "0f2b9c1e-6d4a-4f0e-9e2a-7c1f3d5b8a44"
}
```

Idempotency is checked **before** calling the RPC: the route looks for an
existing `pending` or `confirmed` booking by the same driver, for the same space
and the same exact `starts_at`/`ends_at`, created within the last hour. If one
exists it is returned with `idempotent: true` and HTTP 200. Note that the lookup
keys on the slot, not on `idempotency_key`; the key is validated but not used as
the match criterion at this layer. It is used at the payment layer, where the
`payments.idempotency_key` unique constraint enforces it.

**Response 201**

```json
{
  "ok": true,
  "booking_id": "b14e…",
  "code": "PS-K7R2MQ",
  "bay_index": 0,
  "hold_expires_at": "2026-09-12T09:11:42.318Z",
  "quote": { "…the full quote object…" }
}
```

**Response 200 (idempotent replay)**

```json
{ "ok": true, "idempotent": true, "booking_id": "b14e…", "code": "PS-K7R2MQ",
  "status": "pending", "hold_expires_at": "2026-09-12T09:11:42.318Z" }
```

**Errors:** `NOT_AUTHENTICATED` 401, `RATE_LIMITED` 429, `VALIDATION_FAILED` 400,
and from the RPC: `ACCOUNT_SUSPENDED` 403, `SPACE_NOT_AVAILABLE` 409,
`CANNOT_BOOK_OWN_SPACE` 409, `VEHICLE_NOT_YOURS` 403, `VEHICLE_DOES_NOT_FIT` 409,
`VEHICLE_TYPE_NOT_ACCEPTED` 409, `SPACE_NO_LONGER_AVAILABLE` 409, `UNKNOWN` 500.

### GET /api/bookings

| | |
| --- | --- |
| Auth | session |
| Rate limit | none |

| Parameter | Default | Meaning |
| --- | --- | --- |
| `scope` | `driver` | `host` filters on `host_id`, anything else on `driver_id` |
| `status` | none | Exact `booking_status` match |

Returns `{ "ok": true, "bookings": [...] }`, up to 100 rows, ordered by
`starts_at` descending. Also used by the checkout page as its confirmation poll.

### POST /api/bookings/[id]/cancel

| | |
| --- | --- |
| Auth | session; the RPC decides the party from `auth.uid()` |
| Rate limit | none |

Body is optional: `{ "reason": "Plans changed" }`, max 500 characters. An empty
or unparseable body is fine.

The caller cannot choose a more generous refund. `cancel_booking` works out
whether the caller is the driver, the host or an admin and applies the policy
itself.

**Response 200**

```json
{
  "ok": true,
  "refund_paise": 25000,
  "wallet_return_paise": 0,
  "calc": {
    "ok": true, "refund_paise": 25000, "wallet_return_paise": 0,
    "forfeited_paise": 25000, "platform_keeps_paise": 5000,
    "host_keeps_paise": 22500, "service_fee_retained_paise": 2500,
    "policy": "moderate", "cutoff_hours": 24,
    "hours_before_start": 5.12, "reason": "after_cutoff"
  }
}
```

**Errors:** `NOT_AUTHENTICATED` 401, `BOOKING_NOT_FOUND` 404,
`NOT_AUTHORIZED` 403, `NOT_CANCELLABLE` 409, `UNKNOWN` 500.

### POST /api/bookings/[id]/checkin

| | |
| --- | --- |
| Auth | session; driver or host of the booking |
| Rate limit | none |

Body `{ "lat": 22.5518, "lng": 88.3531 }`, both optional. Check-in succeeds
without a coordinate: refusing to let someone start their booking because a
basement has no GPS fix would fail exactly where parking actually happens. When
a coordinate is present the distance from the true space location is stored in
`checkin_distance_m` as a fraud signal for later review, never as a reason to
block the driver standing at the gate.

**Response 200:** `{ "ok": true, "checked_in_at": "…", "distance_m": 37 }`, or
`{ "ok": true, "already": true, "checked_in_at": "…" }` on a repeat.

**Errors:** `NOT_AUTHENTICATED` 401, `BOOKING_NOT_FOUND` 404, `NOT_AUTHORIZED`
403, `NOT_CHECKINABLE` 409, `TOO_EARLY` 409 (with `opens_at` in `details`),
`UNKNOWN` 500.

### POST /api/bookings/[id]/checkout

| | |
| --- | --- |
| Auth | session; driver or host |
| Rate limit | none |

No body. Computes overstay against `GRACE_PERIOD_MINUTES` and
`OVERSTAY_MULTIPLIER`.

**Response 200**

```json
{ "ok": true, "checked_out_at": "…", "overstay_minutes": 0, "overstay_amount_paise": 0 }
```

**Errors:** `NOT_AUTHENTICATED` 401, `BOOKING_NOT_FOUND` 404, `NOT_AUTHORIZED`
403, `NOT_CHECKED_IN` 409, `UNKNOWN` 500.

### POST /api/bookings/[id]/extend

| | |
| --- | --- |
| Auth | session; driver only |
| Rate limit | none |

Body `{ "new_ends_at": "2026-09-20T12:30:00Z" }`.

**Response 200:** `{ "ok": true, "new_ends_at": "…", "additional_amount_paise": 5000 }`.

**Important:** the extension is applied to the booking immediately and the
additional amount is added to `total_amount_paise`, but **nothing in this build
collects that money.** There is no payment intent for an extension. The charge
is recorded and not taken.

**Errors:** `NOT_AUTHENTICATED` 401, `BOOKING_NOT_FOUND` 404, `NOT_AUTHORIZED`
403, `NOT_EXTENDABLE` (mapped through `isAppErrorCode` to `UNKNOWN` 500, because
`NOT_EXTENDABLE` is **not** in `AppErrorCode`), `NOT_AN_EXTENSION` 400,
`EXTENSION_LIMIT_REACHED` 409, `EXTENSION_BLOCKED` 409.

---

## 4. Payments

### POST /api/payments/create

| | |
| --- | --- |
| Auth | session; must be the booking's driver |
| Rate limit | `payment`, 10 per minute |

Request `{ "booking_id": "b14e…", "idempotency_key": "…" }` (8..100 characters).

The amount is **not** taken from the request. It is read from the booking row. A
client that could name its own price would be able to buy a month of parking for
one rupee.

Zero-amount path: when `total_amount_paise === 0`, meaning a wallet fully covers
the booking, the route confirms directly with the service role rather than
sending a zero-rupee order to a gateway that will reject it, and returns
`{ "ok": true, "zero_amount": true, "confirmed": {...} }`.

**Response 200**

```json
{
  "ok": true,
  "intent": { "provider": "mock", "orderId": "mock_order_9f2c…",
              "amount": 25416, "currency": "INR",
              "bookingCode": "PS-K7R2MQ", "outcomes": ["success", "failure"] },
  "booking_code": "PS-K7R2MQ"
}
```

For Razorpay, `intent` is the Razorpay checkout options object including `key`,
`orderId`, `amount`, `currency`, `name`, `description` and `prefill`.

A duplicate `idempotency_key` collides with the unique constraint on
`payments.idempotency_key` and produces PostgreSQL `23505`. The route treats that
as the retry case working correctly, logs nothing and still returns the intent.

**Errors:** `NOT_AUTHENTICATED` 401, `RATE_LIMITED` 429, `VALIDATION_FAILED` 400,
`BOOKING_NOT_FOUND` 404, `NOT_AUTHORIZED` 403, `BOOKING_NOT_PENDING` 409,
`UPSTREAM_UNAVAILABLE` 503.

### POST /api/payments/webhook

| | |
| --- | --- |
| Auth | signature over the raw body, no session |
| Rate limit | none |

Headers read: `x-razorpay-signature` and `x-parkspace-mock-signature`.

Five rules, in order:

1. Read the body as **text** and verify the HMAC over those exact bytes. Parsing
   first and re-serialising changes key order and whitespace, and the signature
   will not match.
2. Record every attempt, valid or not, before acting. An invalid signature is a
   security signal worth keeping.
3. Deduplicate on the provider's own event id, via the unique constraint on
   `(provider, provider_event_id)`. Gateways retry, sometimes for days.
4. Once the event is durably recorded, always answer 200 even if downstream
   processing fails. A non-200 makes the gateway retry, and retrying will not
   fix a logic error. The failure is written to `webhook_events.processing_error`
   for a human to reconcile.
5. The payload amount is never authoritative. It is compared against
   `payments.amount_paise` and a mismatch throws rather than confirming.

**Responses**

| Situation | Status | Body |
| --- | --- | --- |
| Signature invalid | 400 | `{"ok": false, "error": "SIGNATURE_INVALID"}` |
| Already-seen event id | 200 | `{"ok": true, "duplicate": true}` |
| Could not record the event | 500 | `{"ok": false}` — deliberate, this is the one case where a retry helps |
| Processed | 200 | `{"ok": true, "processed": true}` |
| Recorded but processing failed | 200 | `{"ok": true, "processed": false}` |

On a successful capture the handler updates the payment row, calls
`confirm_booking`, and if that returns `already: false` queues five notification
rows. If `confirm_booking` returns `ok: false` it throws with the message
`PAYMENT TAKEN BUT BOOKING NOT CONFIRMED… Refund required.` That string is the
alerting hook for the most serious failure in the system.

On a failed payment the hold is **deliberately left alone**, so the driver can
reach for a second card without losing the bay. The sweeper expires it at the
normal time if nothing lands.

### POST /api/payments/mock-complete

| | |
| --- | --- |
| Auth | session; must be the booking's driver |
| Rate limit | none |

Returns 403 `NOT_AUTHORIZED` when a real provider is configured, so it can never
become a way to confirm a booking without paying.

Request `{ "booking_id": "b14e…", "outcome": "success" }` where outcome is
`success` or `failure`.

It builds a correctly HMAC-signed event with
`MockPaymentProvider.buildSignedEvent()` and **posts it over HTTP to the real
webhook endpoint**, so the demonstration traverses signature verification, replay
deduplication, amount checking and `confirm_booking` exactly as production would.
Nothing here shortcuts into the database.

**Response 200:** `{ "ok": true, "outcome": "success", "webhook": { "ok": true, "processed": true } }`.

**Errors:** `NOT_AUTHORIZED` 403, `NOT_AUTHENTICATED` 401, `VALIDATION_FAILED`
400, `BOOKING_NOT_FOUND` 404, `PAYMENT_NOT_FOUND` 404 with the message "Start the
payment first.", `UPSTREAM_UNAVAILABLE` 503.

---

## 5. Host

All four host routes rely on RLS for ownership rather than adding a redundant
`host_id` filter, on the stated principle that a policy nobody trusts is a
policy that eventually gets bypassed. None of them applies a rate limit.

### POST /api/host/spaces

Auth: session. Body is `listingSubmitSchema` plus an optional `availability`
array of up to 60 `availabilityRuleSchema` entries.

Creates the listing at `status: 'pending_review'`. It can never create one at
`active`: the `spaces_guard` trigger raises `check_violation` on any transition
into `active` that does not come from an admin session, so a host cannot self
approve even if this route were compromised. Side effects: upserts a
`host_profiles` row if the user has none (rather than putting another form
between a willing host and their first listing), and attempts a best-effort role
promotion to `host` through the service client.

**Response 201:** `{ "ok": true, "id": "…" }`, or with a `warning` string when
the listing saved but the availability rules did not.

**Errors:** `NOT_CONFIGURED` 503, `NOT_AUTHENTICATED` 401, `VALIDATION_FAILED`
400 with `fields`, `UNKNOWN` 500.

### GET /api/host/spaces

Returns `{ "ok": true, "spaces": [...] }` with 19 summary columns for the
caller's own listings, newest first.

### GET /api/host/spaces/[id]

Reads from the `public_spaces` **view**, so the exact address comes back only
because the caller is the host. Returns `{ "ok": true, "space": {...}, "availability": [...] }`.

**Errors:** `SPACE_NOT_FOUND` 404 for a non-UUID id or a row RLS hides,
`NOT_CONFIGURED` 503, `UNKNOWN` 500.

### PATCH /api/host/spaces/[id]

Body is `listingDraftSchema.partial()`. Handling is field-class specific: plain
fields copy through when present; optional numerics accept an explicit `null` to
clear; optional text treats `""` as "remove this", not "store a blank". A bare
`status` of `paused`, `active` or `pending_review` is also accepted, so a
rejected listing can be edited and resubmitted rather than sitting in a state
the host cannot get out of.

**Response 200:** `{ "ok": true, "id": "…", "status": "pending_review" }`.

**Errors:** `VALIDATION_FAILED` 400 (including an empty update),
`NOT_AUTHORIZED` 403 when the guard trigger raises `23514`, `SPACE_NOT_FOUND`
404, `UNKNOWN` 500.

### DELETE /api/host/spaces/[id]

Delisting, not deleting. Bookings reference the space `ON DELETE RESTRICT`, and a
completed booking must keep pointing at the thing it was for: receipts, reviews
and disputes all depend on it. Sets `status: 'delisted'`, which is what a host
actually means by "delete".

**Response 200:** `{ "ok": true, "id": "…", "status": "delisted" }`.

### POST /api/host/availability

Body `{ space_id, starts_at, ends_at, reason? }`. Creates a blackout that
overrides the weekly pattern. The `space_id` in the body cannot be used to close
somebody else's inventory, because RLS scopes the insert to spaces the caller
owns.

**Response 201:** `{ "ok": true, "block": { "id": "…", "starts_at": "…", "ends_at": "…", "reason": null } }`.

**Errors:** `VALIDATION_FAILED` 400, `NOT_AUTHORIZED` 403 on PostgreSQL `42501`,
`UNKNOWN` 500.

### DELETE /api/host/availability

Accepts the id from `?id=` or from a JSON body, because a DELETE with a body is
awkward in some clients. An empty result set means the row does not exist or RLS
hid it, both of which return `NOT_AUTHORIZED` 403.

### GET and POST /api/host/profile

`GET` returns the caller's `host_profiles` row or `null`. `POST` upserts
`display_name`, `bio`, `is_business`, `business_name`, `business_type` and
nothing else. KYC status, Superhost, balances and the reliability rates are all
reverted by the `host_profiles_guard` trigger on any non-admin update, so sending
them would be ignored rather than dangerous; not sending them is clearer.

---

## 6. Reviews

### POST /api/reviews/[id]/respond

Auth: session; must be the review's `subject_id` and the review must be
`driver_to_host`. Body `{ "response": "…" }`, 2 to 1000 characters.

One reply per review. Editing a published reply after the fact would let a host
quietly rewrite history under a review somebody already read, so a second attempt
returns 409.

**Response 200:** `{ "ok": true, "review": { "id": "…", "host_response": "…", "host_responded_at": "…" } }`.

**Errors:** `VALIDATION_FAILED` 400, `NOT_AUTHENTICATED` 401, `NOT_AUTHORIZED`
403 or 404, 409 for a duplicate reply, `UNKNOWN` 500.

---

## 7. Admin

The admin area is under active construction. What exists right now:

| Path | Status |
| --- | --- |
| `src/app/admin/layout.tsx` | Present. Role gate through `requireRole(['admin','support'])`, nine-item nav, and three distinct failure screens for unconfigured, unauthenticated and forbidden |
| `src/app/admin/page.tsx`, `spaces/`, `users/`, `bookings/`, `payments/` | Present |
| `src/app/admin/disputes/`, `coupons/`, `settings/`, `audit/` | **Linked in the nav but not yet implemented** |
| `POST /api/admin/spaces/[id]/moderate` | Present |
| `POST /api/admin/users/[id]/suspend` | Present |
| `src/app/api/admin/coupons/`, `disputes/`, `settings/` | **Empty directories** |

### POST /api/admin/spaces/[id]/moderate

| | |
| --- | --- |
| Auth | admin only, `requireAdmin(['admin'])`. Support reads the queue but does not decide what goes live |

Body `{ "action": "approve" | "reject", "reason": "…" }`. A rejection requires at
least 10 characters of reason, because a host told nothing has no way to fix the
listing, will assume the decision was arbitrary, and will not try again.

The write goes through the service client because the `spaces_guard` trigger
refuses a transition into `active` or `rejected` from anyone the database does
not recognise as an admin. Sets `status`, `rejection_reason`, `reviewed_by` and
`reviewed_at`, writes an `audit_logs` row (`listing.approve` or
`listing.reject`) with before and after state, and queues a
`listing_approved` or `listing_rejected` notification to the host.

**Response 200:** `{ "ok": true, "id": "…", "status": "active", "space": {...} }`.

**Errors:** `SPACE_NOT_FOUND` 404, `NOT_AUTHENTICATED` 401, `ACCOUNT_SUSPENDED`
403, `NOT_AUTHORIZED` 403, `NOT_CONFIGURED` 503, `VALIDATION_FAILED` 400,
`UNKNOWN` 500.

### POST /api/admin/users/[id]/suspend

| | |
| --- | --- |
| Auth | admin only |

Body `{ "action": "suspend" | "unsuspend", "reason": "…" }`. Suspension requires
at least 5 characters of reason. Two guards: an admin cannot suspend themselves,
which is the only cheap protection against locking the last administrator out of
the panel, and an account whose role is `admin` cannot be suspended until the
role is removed first. Both return 400 with a specific message.

Sets `is_suspended`, `suspended_reason`, `suspended_at`; writes
`user.suspend`/`user.unsuspend` to `audit_logs`; queues an `account_suspended`
or `account_reinstated` notification.

**Response 200:** `{ "ok": true, "id": "…", "is_suspended": true }`.

---

## 8. Infrastructure

### GET /api/cron

| | |
| --- | --- |
| Auth | `Authorization: Bearer <CRON_SECRET>`, compared character by character with no early return on mismatch |
| Schedule | `*/5 * * * *` from `vercel.json` |
| `maxDuration` | 60 seconds |

When `CRON_SECRET` is unset and `NODE_ENV === 'production'`, the route refuses
with 503 rather than exposing the sweepers to the open internet. Every step is
idempotent, because a cron that cannot be safely retried will eventually corrupt
something. Each step is individually try-caught, so one failure does not stop the
rest.

Six steps: `expire_stale_holds()`, `auto_complete_stale_bookings()`, publish
reviews past `REVIEW_WINDOW_DAYS`, `refresh_superhost_badges()`, mark due
notifications as sent, count bookings past `PAYOUT_DELAY_HOURS`.

**Response 200**

```json
{
  "ok": true, "ran_at": "2026-09-12T09:05:00.114Z", "duration_ms": 412,
  "expired_holds": 2, "auto_completed": 0, "published_reviews": 1,
  "superhosts_refreshed": 5, "notifications_dispatched": 7, "payable_bookings": 3
}
```

A failed step reports as a string, for example
`"expired_holds": "error: permission denied"`, and the overall response is still
`ok: true` with HTTP 200.

**Errors:** `NOT_CONFIGURED` 503, `NOT_AUTHORIZED` 401.

### GET /auth/callback

| | |
| --- | --- |
| Auth | public; the `code` query parameter is the credential |

Exchanges a one-time code from a magic link or confirmation email for a session
cookie, then redirects.

The `next` parameter is validated: `rawNext.startsWith('/') && !rawNext.startsWith('//')`,
otherwise it falls back to `/`. Accepting an arbitrary URL would turn sign-in
into an open redirect, which is a phishing primitive: a genuine ParkSpace link
that lands the user on a page an attacker controls, already trusting the domain.
Rejecting `//` specifically blocks protocol-relative URLs such as
`//evil.example.com`, which do start with `/`.

| Outcome | Redirect |
| --- | --- |
| No `code` | `/auth/login?error=That link is missing its code. Request a new one.` |
| Exchange failed | `/auth/login?error=That link has expired or has already been used. Request a new one.` |
| Success | `${origin}${next}` |

---

## 9. Database RPC functions

These are callable directly from the browser through `supabase.rpc()`, subject to
the grants in migration 0008.

| Function | Parameters | Returns | Granted to |
| --- | --- | --- | --- |
| `search_spaces` | `p_lat double precision, p_lng double precision, p_radius_m integer default 1500, p_starts_at timestamptz default null, p_ends_at timestamptz default null, p_vehicle_type vehicle_type default null, p_max_price_paise bigint default null, p_space_types space_type[] default null, p_amenities text[] default null, p_min_rating numeric default null, p_instant_only boolean default false, p_ev_only boolean default false, p_sort text default 'relevance', p_limit integer default 60, p_offset integer default 0` | `setof` 27 columns: `id, title, slug, locality, city, approx_lat, approx_lng, distance_m, space_type, vehicle_types, amenities, capacity, free_bays, price_hourly_paise, price_daily_paise, price_monthly_paise, quoted_base_paise, avg_rating, review_count, instant_book, has_ev_charging, max_height_mm, cancellation_policy, is_superhost, primary_photo, relevance_score, total_count` | `anon`, `authenticated` |
| `quote_booking` | `p_space_id uuid, p_starts_at timestamptz, p_ends_at timestamptz, p_coupon_code text default null, p_use_wallet boolean default false, p_user_id uuid default null` | `jsonb`, the `Quote` shape | `anon`, `authenticated` |
| `create_booking_hold` | `p_space_id uuid, p_starts_at timestamptz, p_ends_at timestamptz, p_vehicle_id uuid default null, p_coupon_code text default null, p_use_wallet boolean default false, p_notes text default null` | `jsonb` `{ok, booking_id, code, bay_index, hold_expires_at, quote}` | `authenticated` |
| `cancel_booking` | `p_booking_id uuid, p_reason text default null` | `jsonb` `{ok, refund_paise, wallet_return_paise, calc}` | `authenticated` |
| `check_in_booking` | `p_booking_id uuid, p_lat double precision default null, p_lng double precision default null` | `jsonb` `{ok, checked_in_at, distance_m}` | `authenticated` |
| `check_out_booking` | `p_booking_id uuid` | `jsonb` `{ok, checked_out_at, overstay_minutes, overstay_amount_paise}` | `authenticated` |
| `extend_booking` | `p_booking_id uuid, p_new_ends_at timestamptz` | `jsonb` `{ok, new_ends_at, additional_amount_paise}` | `authenticated` |
| `compute_refund_paise` | `p_booking_id uuid, p_by cancelled_by_party` | `jsonb` `{ok, refund_paise, wallet_return_paise, forfeited_paise, platform_keeps_paise, host_keeps_paise, service_fee_retained_paise, policy, cutoff_hours, hours_before_start, reason}` | `authenticated` |
| `space_availability_calendar` | `p_space_id uuid, p_from date, p_to date` | `setof (day date, total_bays smallint, booked_bays integer, is_blocked boolean, has_rules boolean, multiplier_bp integer)` | `anon`, `authenticated` |
| `is_space_available` | `p_space_id uuid, p_starts_at timestamptz, p_ends_at timestamptz` | `boolean` | `anon`, `authenticated` |
| `count_free_bays` | `p_space_id uuid, p_starts_at timestamptz, p_ends_at timestamptz, p_exclude_booking uuid default null` | `integer` | `anon`, `authenticated` |
| `price_quote_paise` | `p_space_id uuid, p_starts_at timestamptz, p_ends_at timestamptz` | `bigint` | `anon`, `authenticated` |

`compute_refund_paise` is pure policy with no side effects, which is why it is
safe to grant: a driver may legitimately preview their refund before cancelling.

### RPCs deliberately NOT granted to client roles

Migration 0008 revokes these explicitly. Each runs only under the service key.

| Function | Why it is revoked |
| --- | --- |
| `confirm_booking(uuid, uuid)` | It is the only thing that moves a booking to `confirmed`. If a client could call it, anyone could confirm their own booking without paying. It is invoked exclusively by the webhook handler after signature verification and the amount check, and by `/api/payments/create` for the zero-amount wallet case. |
| `expire_stale_holds()` | Operates across every user's rows. A client call would let anyone release every pending hold in the system, which is a denial-of-inventory attack against every driver mid-checkout. |
| `auto_complete_stale_bookings()` | Writes `completed` and `no_show` across all bookings. Forcing another driver to `no_show` would destroy their refund entitlement. |
| `refresh_superhost_badges()` | Writes `is_superhost` across every host. A badge is a trust signal and must not be settable from a client. |

Two further functions are not granted to anyone and exist only as internals
called from within other `SECURITY DEFINER` functions:
`is_within_availability_rules`, `next_free_bay` and `recompute_trust_score`. The
helper predicates `is_admin()`, `is_full_admin()` and `has_address_access()` are
used inside RLS policies and the `public_spaces` view.

### Why the RPC layer exists at all

Every operation that touches money and state at the same time is one function
rather than a sequence of statements from the application. The migration header
states the reason directly: a partial failure between two round trips is exactly
how a driver ends up charged for a booking that does not exist. The RLS policy
`bookings_no_direct_insert` requires `is_full_admin()` for any direct insert into
`bookings`, so `create_booking_hold` is the only path in, and the
`bookings_guard_direct` trigger blocks a client changing `status` or any money
column through a direct update. The RPCs are not a convenience layer; they are
the only door.
