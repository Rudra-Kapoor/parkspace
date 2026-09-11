# 26. Testing Strategy

> Section 1 reports what is actually tested today, with real numbers from a real
> run. Sections 3 onwards describe what should exist and how to build it. The two
> are kept apart deliberately, because a testing document that blends them is how
> a team convinces itself it has coverage it does not have.

## 1. What is tested today

Run on the current tree:

```
$ npx vitest run

 ✓ src/lib/policy.test.ts (21 tests) 123ms
 ✓ src/lib/money.test.ts  (28 tests) 330ms

 Test Files  2 passed (2)
      Tests  49 passed (49)
   Duration  2.11s
```

**Two files. Forty-nine tests. All passing. Both cover pure functions in
`src/lib/`.**

Runner: Vitest 2.1.9, `environment: 'node'`, `include: ["src/**/*.test.ts",
"tests/**/*.test.ts"]`, coverage provider `v8` scoped to `src/lib/**`. The
`tests/` directory does not exist. `npm run verify` chains
`tsc --noEmit && vitest run`, and `scripts/deploy.mjs --check` runs both as
deployment preconditions.

### What `money.test.ts` asserts (28 tests)

| Group | Assertions |
| --- | --- |
| `assertPaise` | Rejects `12.5` with a message matching `/integer number of paise/`, which is precisely the bug the guard exists to catch: someone passes 12.5 meaning rupees and it silently becomes 12.5 paise. Rejects `NaN`, `Infinity` and negatives. Accepts zero |
| Rupee conversion | `rupeesToPaise(300) === 30000`; rounds rather than truncates at the third decimal, so `12.345` is 1235 and `12.344` is 1234; and `rupeesToPaise(0.1 + 0.2) === 30`, the classic binary floating point case |
| `applyBasisPoints` | 10 percent of Rs 300 is Rs 30; rounds half away from zero, so 5 paise at 50 percent is 3; rejects a fractional rate, which is how a percent gets passed by mistake |
| `splitPaise` | `splitPaise(100, 3) === [34, 33, 33]`; exact division; single part |
| `splitPaiseByWeights` | Largest-remainder correctness; `(1000, [3,1]) === [750, 250]`; even split when all weights are zero |
| `computeBreakdown` | The worked Rs 300 example, every line asserted: fee 1500, tax 270, total 31770, commission 3000, payout 27000, platform revenue 4500. Identity `total = taxable + fee + tax`. Identity `base − discount = commission + payout`. A wallet credit does **not** reduce the host's payout. Wallet application capped at the amount owed. A discount larger than the base throws |
| Formatting | Indian digit grouping: `formatPaise(123456700) === '₹12,34,567'`. Paise shown only when non-zero. `formatPaiseCompact` at four magnitudes |

### What `policy.test.ts` asserts (21 tests)

| Group | Assertions |
| --- | --- |
| The Rs 500 reference booking | fee 2500, tax 450, total 52950, payout 45000, platform revenue 7500 |
| `flexible` | Full parking refund at 2 h before; **nothing** at 0.5 h before; and the forfeit split, host keeps Rs 450 and the platform keeps Rs 75 |
| `moderate` | Full at 25 h; half at 5 h with the split asserted; and **exactly 24 h counts as inside the full-refund window**, which is the boundary case a `>=` versus `>` mistake would break |
| `strict` | Half beyond 48 h, nothing inside |
| `non_refundable` | Zero at 1000, 48, 24, 1 and 0.1 hours before |
| Host and platform cancellation | The driver is made whole including the fee under **all four** policies, and a platform cancellation is `toEqual` a host one |
| After check-in | Nothing refundable, reason `already_checked_in`, host keeps the normal payout |
| Wallet on cancellation | Credit returns in proportion to the cash refund: on a half refund of a Rs 500 booking with Rs 200 in credit, Rs 100 returns to the wallet and Rs 150 to the card, summing to Rs 250. Never returns more credit than was applied |
| Overstay | Nothing inside grace, including exactly at the boundary. **Charged from the original end time**: 11 minutes late with 10 minutes grace bills a full hour at 1.5x, Rs 75, not one minute. Rounds up at 61, 120 and 121 minutes |
| Check-in window | Opens at exactly `starts_at − 30 min`, closed at 29 minutes |
| Cutoffs | `POLICY_CUTOFF_HOURS` matches the spec kernel table |

### The randomised invariant tests

Four of the 49 are property-style tests using `Math.random()` rather than a
property-testing library. They are the most valuable tests in the suite, because
each one asserts a law rather than an example.

| Test | Iterations | Invariant |
| --- | --- | --- |
| `splitPaise` preserves the total | 200 | Random total up to 1,000,000 paise split into 1 to 12 parts; the parts always sum **exactly** to the total. Neither loses nor invents a paise |
| `splitPaiseByWeights` preserves the total | 200 | Random total up to 500,000 across 1 to 8 random weights; same exact-sum property under largest remainder |
| `computeBreakdown` never produces a negative | 500 | Random base, discount bounded by the base, and wallet up to 500,000. Asserts **every field** of the returned object is `>= 0`, with the failing base amount in the message, and re-asserts `total = taxable + fee + tax` on each iteration |
| `computeRefund` invariants across every combination | 400 | Random base, random policy of four, random cancelling party of three, and `hoursBeforeStart` uniform over `[-10, 190]` so past-start cases are included. Asserts refund, forfeit, host share and platform share are all non-negative; refund never exceeds what was paid; and for a driver cancellation the forfeit is **fully accounted for**: `hostKeeps + (platformKeeps − serviceFeeRetained) === forfeited`. Nothing vanishes and nothing is invented |

Each carries a `context` string so a failure names the exact inputs. That matters
with random inputs: a failure without the seed is not reproducible, and these
tests print the values instead.

**Limitation of this approach:** `Math.random()` is unseeded, so a failure is not
reproducible by re-running. Migrating to `fast-check` with a fixed seed and
automatic shrinking would give reproducible counterexamples and minimal failing
cases, and is the single highest-value change to the existing suite.

### What is NOT tested today

Stated plainly, because this is the gap the rest of this document addresses.

| Area | Tests |
| --- | --- |
| Any SQL: `price_quote_paise`, `is_space_available`, `is_within_availability_rules`, `count_free_bays`, `next_free_bay`, `quote_booking`, `create_booking_hold`, `confirm_booking`, `cancel_booking`, `check_in_booking`, `check_out_booking`, `extend_booking`, `compute_refund_paise`, `search_spaces` | **none** |
| The exclusion constraint and its concurrency behaviour | **none** |
| Every trigger: state machine, counters, jitter, redaction, wallet balance, privileged-column guards | **none** |
| Every RLS policy | **none** |
| Any API route handler | **none** |
| The payment providers: HMAC signing, verification, timing-safe comparison | **none** |
| Webhook replay, amount mismatch, dedupe | **none** |
| Validation schemas in `src/lib/validation.ts` | **none** |
| `src/lib/geo.ts`, `src/lib/rate-limit.ts`, `src/lib/errors.ts`, `src/lib/dashboard.ts` | **none** |
| Any React component | **none** |
| Accessibility | **none** |
| Load and performance | **none** |

The two tested files are the two that are easiest to test, which is the usual
shape of a young suite. The untested parts include the exclusion constraint,
which is the single correctness guarantee the entire product rests on.

## 2. Why the gap exists, and what it costs

A large fraction of the business logic lives in SQL. That was a deliberate
architectural choice with a real benefit, documented in
`10_System_Architecture.md`: every access path is subject to the same rules, and
a money-and-state operation is one transaction rather than two round trips. The
cost is exactly this: SQL functions are not unit-testable with Vitest alone, and
a TypeScript-only suite can never reach them.

`src/lib/policy.ts` states the mitigation honestly in its header: the rules live
in two places because the UI needs a refund preview without a round trip, and
"policy logic in SQL is close to untestable while policy logic here can be
exercised exhaustively." The TypeScript mirror is tested, the SQL original is
not, and **nothing verifies that the two agree**. That is a real risk: migration
0009 and `computeRefund` were written to match, and a future edit to one could
silently diverge from the other.

## 3. The target testing pyramid

```
                        ╱╲
                       ╱  ╲        E2E  (Playwright)           ~12 flows
                      ╱────╲       slow, brittle, high value
                     ╱      ╲
                    ╱────────╲     Integration (real Postgres)  ~120 tests
                   ╱          ╲    RPCs, triggers, RLS, routes
                  ╱────────────╲
                 ╱              ╲  Unit (Vitest, in-process)    ~300 tests
                ╱────────────────╲ pure functions, adapters, schemas
               ────────────────────
                Static: tsc --noEmit, eslint, zod at every boundary
```

The unusual feature of this pyramid is that the **integration layer is where most
of the value is**, not the unit layer, because most of the logic is in the
database. That inverts the usual advice and it is the correct shape here.

## 4. Layer 1: unit tests

Runs in-process with no database. Target: under 10 seconds.

| Module | What to test | Why it is not tested now |
| --- | --- | --- |
| `money.ts` | Done, 28 tests | |
| `policy.ts` | Done, 21 tests | |
| `payments/mock.ts` | `buildSignedEvent` produces a body whose signature `verifyWebhook` accepts; a tampered body is rejected; a truncated signature is rejected without throwing; `verifyWebhook` returns `null` rather than throwing on malformed JSON; `signClientCallback` round-trips; the production guard throws when `NODE_ENV=production` without `ALLOW_MOCK_PAYMENTS` | Never written |
| `payments/razorpay.ts` | Signature verification against a known-good fixture; event-id derivation `${eventType}:${entityId}`; status mapping for `payment.captured`, `payment.authorized`, `payment.failed`, `refund.*` and an unknown event; `isConfigured` false with missing keys. Use `msw` or a `fetch` stub for `createIntent` and `refund` | Never written |
| `payments/index.ts` | Falls back to mock when razorpay is selected without credentials, and warns; `resetPaymentProvider` clears the singleton | Never written |
| `validation.ts` | Every schema, boundary by boundary. Registration normalisation (`"WB 02 AB 1234"` → `"WB02AB1234"`); phone stripping; `searchParamsSchema` rejecting `ends_at <= starts_at`; `listingSubmitSchema` requiring a height limit for covered, basement, garage and stack types; `listingSubmitSchema` requiring at least one price | Never written |
| `geo.ts` | `distanceMetres` against known city pairs; `boundingBox` containment; `formatDistance` at the 1 km boundary; `walkingMinutes` never returns 0; `clusterPoints` grid correctness | Never written |
| `rate-limit.ts` | Allows exactly `limit`, rejects `limit + 1`; the window resets after `windowMs` with a fake timer; `callerKey` prefers the user id over the IP; the sweep removes expired windows | Never written |
| `errors.ts` | Every `AppErrorCode` has a catalogue entry (assert `Object.keys(ERROR_CATALOGUE).length` equals the union size); `fromRpcError` handles a string, an object with `error`, and garbage; no two codes map to contradictory statuses | Never written |
| `dashboard.ts` | `istDayStart` and `istMonthStart` across a month boundary and across UTC midnight, which is the case an IST offset gets wrong | Never written |

### The mirror-agreement test

The highest-value unit test that does not exist: a table-driven test asserting
that `computeRefund()` in TypeScript and `compute_refund_paise()` in SQL return
identical values for the same inputs. It belongs in the integration layer,
because it needs a database, and it is the only thing that would catch a
divergence between migration 0009 and `src/lib/policy.ts`.

## 5. Layer 2: integration tests against a real Postgres

Not a mock, not an in-memory shim, not `pg-mem`. The exclusion constraint,
`btree_gist`, `tstzrange`, generated columns, triggers and RLS only behave
correctly in real Postgres, and a substitute that gets any of them wrong is worse
than no test.

### Harness

```
docker run -d --name parkspace-test -e POSTGRES_PASSWORD=test -p 55432:5432 postgres:16
```

Apply migrations 0001 to 0009 in order. The `auth` schema does not exist in bare
Postgres, so the harness needs a shim:

```sql
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text, phone text,
                                       raw_user_meta_data jsonb default '{}');
-- auth.uid() reads a session-local setting, which is how a test impersonates a user
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
```

Then `set local request.jwt.claim.sub = '<uuid>'` inside a transaction is how a
test runs "as" a user. This is exactly how Supabase does it, so the policies
under test are the real ones.

Each test runs in a transaction rolled back at the end, which gives isolation
without re-seeding, except the concurrency tests in section 6 which need real
concurrent transactions and therefore need real cleanup.

### What to cover

| Group | Tests | Examples |
| --- | --- | --- |
| `price_quote_paise` | ~20 | 26 h on an hourly+daily space is 1 day + 2 h = Rs 400. 23 h is capped at the daily rate, Rs 300. A daily-only space rounds a 3 h stay up to one day. A price override of 15000 bp multiplies the whole stay. The largest overlapping override wins. A monthly+daily space is **not** capped, documenting the known gap in `14_Booking_Engine_Specification.md` section 5 |
| `is_within_availability_rules` | ~15 | No rules means always available. A Monday 09:00-18:00 window accepts 10:00-12:00 and rejects 08:00-10:00. An overnight 20:00-08:00 window with `ends_next_day` accepts 22:00 to 06:00 next day. A multi-day booking spanning a closed Sunday fails. DST is not a concern in IST, but a non-IST timezone argument should be exercised |
| `is_space_available` | ~15 | Each of the nine checks failing in isolation, with all others satisfied, so a test failure names the check |
| `count_free_bays` / `next_free_bay` | ~10 | `count(distinct bay_index)` versus `count(*)`: a bay holding three non-overlapping bookings inside the window still counts as one taken bay. `next_free_bay` returns the lowest index. Returns null at capacity |
| The state machine trigger | ~20 | Every legal transition succeeds, every illegal one raises `check_violation`. A no-op update is permitted. All three terminal states reject everything |
| Every other trigger | ~25 | Jitter is deterministic and 80-150 m from the true point, and is stable across an unrelated update. Plate normalisation. First vehicle becomes default. The wallet balance invariant, including the insufficient-balance rejection. Message redaction. All four privileged-column guards |
| The RPCs | ~30 | `create_booking_hold` returning each of its nine error codes. `confirm_booking` idempotency, the lapsed-hold-but-free path, and the lapsed-hold-and-taken path. `cancel_booking` for each policy and each party. `extend_booking` for each rejection. `check_out_booking` overstay at and either side of the grace boundary |
| The mirror agreement | ~40 | A table of inputs run through both `compute_refund_paise` and `computeRefund`, asserting field-by-field equality |
| `search_spaces` | ~10 | The bounding box excludes a space outside the radius. Filters compose. Sorts order correctly. `total_count` is the unpaginated count. **Never returns `lat`, `lng`, `address_line`, `landmark` or `access_instructions`**, asserted by inspecting the returned column names |

### API route tests

Route handlers can be tested in-process by importing the exported `GET`/`POST`
and passing a constructed `NextRequest`, with the Supabase client pointed at the
test database. Priority cases:

| Route | Test |
| --- | --- |
| `POST /api/bookings` | Idempotent replay returns the existing hold with `idempotent: true` and creates no second row |
| `POST /api/payments/create` | The amount comes from the booking, not the request, even when the request contains an `amount` field |
| `POST /api/payments/create` | The zero-amount path confirms directly and never calls the provider |
| `GET /auth/callback` | `next=//evil.example.com` redirects to `/`; `next=https://evil.example.com` redirects to `/`; `next=/checkout/abc` is preserved |
| `GET /api/cron` | A wrong secret returns 401; an absent secret in production returns 503 |
| `GET /api/geocode` | A query under 3 characters returns an empty array without calling upstream; a second identical query is served from cache |

## 6. The concurrency test that must exist

This is the single most important test in the whole strategy, because it verifies
the one property the product cannot function without. It does not exist today.

### What it must prove

Given N parallel transactions attempting to book the same space, same bay and
overlapping intervals, **exactly one commits** and the other N−1 receive
SQLSTATE `23P01`.

### How to write it

Vitest with the `pg` driver and N genuinely separate connections. Connection
pooling is not sufficient: the transactions must be concurrent, on distinct
sessions, and must overlap in time.

```ts
import { Pool } from 'pg';
import { describe, expect, it, beforeAll } from 'vitest';

const CONCURRENCY = 20;

describe('bookings_no_overlap under concurrency', () => {
  it('lets exactly one of N racing transactions commit', async () => {
    // Distinct connections, not a shared pooled one.
    const pool = new Pool({ connectionString: TEST_DB_URL, max: CONCURRENCY });

    const starts = '2026-10-01T10:00:00+05:30';
    const ends   = '2026-10-01T14:00:00+05:30';

    // A barrier so every transaction is inside BEGIN before any of them inserts.
    let release: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });

    const attempt = async (driverId: string) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        // Force the window open: hold the transaction before the insert.
        await client.query('SELECT 1');
        await gate;
        await client.query(
          `insert into bookings
             (space_id, driver_id, host_id, bay_index, starts_at, ends_at,
              status, hold_expires_at, base_amount_paise, total_amount_paise)
           values ($1, $2, $3, 0, $4, $5, 'pending', now() + interval '10 minutes', 30000, 30000)`,
          [SPACE_ID, driverId, HOST_ID, starts, ends],
        );
        await client.query('COMMIT');
        return { ok: true as const };
      } catch (error: any) {
        await client.query('ROLLBACK');
        return { ok: false as const, code: error.code };
      } finally {
        client.release();
      }
    };

    const drivers = await createTestDrivers(CONCURRENCY);
    const running = drivers.map(attempt);
    release!();                                   // fire them all at once
    const results = await Promise.all(running);

    const winners = results.filter((r) => r.ok);
    const losers  = results.filter((r) => !r.ok);

    expect(winners).toHaveLength(1);              // ← THE ASSERTION
    expect(losers).toHaveLength(CONCURRENCY - 1);
    // Every loser must fail for the RIGHT reason. A deadlock or a timeout
    // passing the count assertion would be a false green.
    expect(losers.every((l) => l.code === '23P01')).toBe(true);

    const { rows } = await pool.query(
      `select count(*)::int as n from bookings
        where space_id = $1 and bay_index = 0
          and status in ('pending','confirmed','active')
          and period && tstzrange($2, $3, '[)')`,
      [SPACE_ID, starts, ends],
    );
    expect(rows[0].n).toBe(1);                    // ← and the database agrees

    await pool.end();
  }, 30_000);
});
```

### Variants that must also be covered

| Variant | Expected |
| --- | --- |
| Multi-bay space, capacity 3, 20 racers through `create_booking_hold` | Exactly 3 commit, on bays 0, 1 and 2. Also documents the known simplification that the RPC does not retry another bay after an exclusion violation |
| Adjacent intervals, one ending exactly when the other starts | **Both commit.** This proves the half-open `'[)'` range. A closed range would fail this test, and failing it would silently destroy one slot of inventory at every boundary in the day |
| Overlapping by one second | Exactly one commits |
| Different bays, same interval | Both commit |
| Different spaces, same interval | Both commit |
| One `pending` plus one `confirmed` racing | Exactly one commits, proving `pending` participates |
| A racer against a `cancelled` booking on the same slot | Commits, proving terminal states do not hold inventory |
| Concurrent `extend_booking` calls into the same tail | Exactly one succeeds, the other returns `EXTENSION_BLOCKED` |
| Concurrent `wallet_transactions` debits draining a balance | The balance never goes negative, proving the `FOR UPDATE` lock |

Run this test in CI on every commit. It is fast, it is deterministic, and it is
the one that must never go red.

## 7. Webhook replay tests

| Test | Assertion |
| --- | --- |
| Valid signature, first delivery | 200, `webhook_events` row created, payment `captured`, booking `confirmed`, 5 notifications queued |
| Identical event delivered twice | Second returns `{ok: true, duplicate: true}`; exactly one `webhook_events` row; exactly one wallet `booking_spend` row; exactly one `coupon_redemptions` row; still 5 notifications, not 10 |
| Delivered 10 times concurrently | Exactly one processes. This needs real concurrency for the same reason section 6 does |
| Tampered body, original signature | 400 `SIGNATURE_INVALID`; a `webhook_events` row with `signature_valid: false` and the truncated raw body; booking untouched |
| Missing signature header | 400, same recording |
| Amount mismatch | Booking stays `pending`; payment **not** marked captured; `processing_error` contains "Amount mismatch"; response is 200 |
| Capture for a booking whose hold lapsed, bay still free | Confirms |
| Capture for a booking whose hold lapsed, bay resold | `HOLD_EXPIRED_AND_TAKEN`; `processing_error` contains "PAYMENT TAKEN BUT BOOKING NOT CONFIRMED"; response 200 |
| `payment.failed` | Payment `failed` with code and reason; booking **stays** `pending` with its hold intact |
| Body that is not JSON | 400, no crash |
| Razorpay event with no `payment.entity` | `eventId` is `${eventType}:unknown`, handled without throwing |

## 8. RLS policy tests

Every one of these runs twice: once as the owner, asserting success, and once as
a stranger, asserting an empty result set. **PostgREST and RLS return zero rows
rather than an error**, so the assertion must be on row count, not on a thrown
exception. Testing only the positive case is how an RLS regression ships.

| Policy | Positive | Negative |
| --- | --- | --- |
| `bookings_participant_read` | Driver A reads booking A; host A reads booking A | **User B reads booking A: 0 rows.** The canonical test |
| `profiles_select_self` | A reads A | B reads A: 0 rows |
| `vehicles_owner_all` | A reads A's vehicle | B reads it: 0 rows |
| `vehicles_host_read_booked` | Host reads the vehicle on a confirmed booking into their space | The same host reads it after the booking is cancelled: 0 rows |
| `public_spaces` address release | Driver with a confirmed booking, 23 h before start: `address_line` and `exact_lat` non-null | The same driver 25 h before start: **null**. A stranger: null. A driver whose booking is `pending`: null |
| Column grant on `parking_spaces` | `authenticated` selecting the granted columns succeeds | `select address_line from parking_spaces` as `authenticated` raises `42501` insufficient privilege. Distinct from the view test, and the stronger guarantee |
| `bookings_no_direct_insert` | Service role inserts | `authenticated` inserts: refused |
| `wallet_admin_write` | Service role inserts | `authenticated` inserts a credit to themselves: refused |
| `payments_own_read` | Payer reads; the booking's host reads | An unrelated user: 0 rows |
| `reviews_participant_insert` | Driver on a `completed` booking, correct direction and subject | The same driver on a `confirmed` booking: refused. The driver with `direction: 'host_to_driver'`: refused |
| `messages_participant_insert` | A participant | A stranger: refused |
| `coupons_public_read` | An active, in-window coupon is visible | An inactive or expired one: 0 rows |
| `settings_public_read` | Anyone reads | `authenticated` writes: refused |
| `webhook_admin_only` | Service role | `authenticated` reads: 0 rows |
| `audit_admin_read` | Admin reads | `authenticated` reads: 0 rows |

## 9. End-to-end flows

Playwright against a real browser and a seeded database. Twelve flows, no more;
E2E is the layer that rots fastest and each one must earn its place.

| # | Flow |
| --- | --- |
| 1 | Anonymous: land, search Park Street, see map pins and list, open a listing, see the jittered pin and **not** the exact address |
| 2 | Register with a password, land back on the page the sign-in interrupted |
| 3 | Add a vehicle; assert it becomes the default automatically |
| 4 | Full driver happy path: search, quote, hold, mock pay success, poll, land on a confirmed booking |
| 5 | Access details appear only within 24 hours of the start |
| 6 | Check in, see the QR, check out, see zero overstay |
| 7 | Cancel under `moderate` more than 24 hours out and see the full refund figure |
| 8 | Mock pay failure: the hold survives, a retry succeeds |
| 9 | Host: complete the listing wizard, land at `pending_review`, see it is not in search |
| 10 | Admin: approve it, see it in search, see the host's notification |
| 11 | Admin: suspend a user, confirm their booking attempt fails with `ACCOUNT_SUSPENDED` |
| 12 | Hold expiry: fake the clock, confirm the countdown reaches zero and the page says the space was released and nothing was charged |

## 10. Accessibility testing

| Method | Target |
| --- | --- |
| `@axe-core/playwright` on all 12 E2E flows | **Zero** critical or serious violations. Fail the build on any |
| Keyboard-only walkthrough of flow 4 | Every control reachable and operable; visible focus throughout; no keyboard trap in the payment sheet or the user menu |
| Screen reader spot check, NVDA and VoiceOver | The hold countdown is announced (it already carries `aria-live="polite"`); form errors are associated with their inputs; the map has a usable non-visual alternative, which today means the results list |
| Contrast audit in both themes | WCAG 2.2 AA: 4.5:1 for body text, 3:1 for large text and UI components |
| Reduced motion | `prefers-reduced-motion` respected by the spinner and any transition |
| Zoom | 200 percent with no horizontal scroll and no clipped content |

The map is the hard case. MapLibre canvas content is invisible to a screen
reader, so the list must be a complete equivalent, not a summary. That is a
design requirement, and it should be asserted in a test: every space shown as a
pin must also be present as a list item.

## 11. Load testing targets

k6 or Artillery against a preview deployment with production-shaped data:
5,000 spaces, 50,000 bookings, 200,000 search events.

| Endpoint | Load | p50 | p95 | p99 | Error rate |
| --- | --- | --- | --- | --- | --- |
| `GET /api/search` | 100 rps sustained 5 min | < 150 ms | < 400 ms | < 800 ms | < 0.1% |
| `POST /api/quote` | 40 rps | < 100 ms | < 250 ms | < 500 ms | < 0.1% |
| `POST /api/bookings` | 10 rps | < 200 ms | < 500 ms | < 1 s | < 0.1% excluding legitimate 409s |
| `POST /api/payments/webhook` | 50 rps burst | < 150 ms | < 400 ms | < 800 ms | 0% |
| `GET /api/cron` | 1 per 5 min | n/a | < 10 s | < 30 s | 0%, and must stay under the 60 s `maxDuration` |
| Listing page, cold | 20 rps | < 400 ms | < 900 ms | < 1.5 s | < 0.1% |

Specific scenarios worth running:

| Scenario | What it proves |
| --- | --- |
| 200 concurrent holds on a 50-bay space | Exactly 50 succeed; the rest get clean 409s, not 500s |
| Search with `starts_at`/`ends_at` over 5,000 spaces | `is_space_available` and `count_free_bays` run per candidate inside `search_spaces`, which is the likeliest scaling cliff in the whole system. Measure it deliberately |
| Cron with 10,000 expired holds | Completes inside 60 seconds |
| Geocode under fan-out | The 1-request-per-second pacing queue does not become a request pile-up, and confirm empirically that the per-instance queue exceeds the Nominatim policy under multi-instance load |

## 12. Test matrix

| Area | Layer | Priority | Tests | Today | Gate |
| --- | --- | --- | --- | --- | --- |
| Money arithmetic | Unit | P0 | 28 | **28** | every commit |
| Refund policy, TypeScript | Unit | P0 | 21 | **21** | every commit |
| **Exclusion constraint concurrency** | Integration | **P0** | 9 | **0** | every commit |
| Booking RPCs | Integration | P0 | 30 | 0 | every commit |
| RLS policies | Integration | P0 | 16 | 0 | every commit |
| Webhook replay and signatures | Integration | P0 | 11 | 0 | every commit |
| Payment provider adapters | Unit | P0 | 15 | 0 | every commit |
| Availability engine | Integration | P1 | 15 | 0 | every commit |
| Pricing SQL | Integration | P1 | 20 | 0 | every commit |
| SQL/TS refund mirror agreement | Integration | P1 | 40 | 0 | every commit |
| Triggers | Integration | P1 | 25 | 0 | every commit |
| Validation schemas | Unit | P1 | 35 | 0 | every commit |
| API route handlers | Integration | P1 | 25 | 0 | every commit |
| `search_spaces` | Integration | P1 | 10 | 0 | every commit |
| Geo helpers | Unit | P2 | 12 | 0 | every commit |
| Rate limiter | Unit | P2 | 8 | 0 | every commit |
| Error catalogue completeness | Unit | P2 | 5 | 0 | every commit |
| Dashboard time helpers | Unit | P2 | 10 | 0 | every commit |
| E2E flows | E2E | P1 | 12 | 0 | pre-merge to main |
| Accessibility | E2E | P1 | 12 | 0 | pre-merge to main |
| Load | Load | P2 | 6 | 0 | weekly and pre-release |
| **Total** | | | **~365** | **49** | |

## 13. Coverage targets and CI gates

| Scope | Target |
| --- | --- |
| `src/lib/**` line coverage | 90 percent. Currently configured in `vitest.config.ts` but no threshold is enforced |
| `src/app/api/**` line coverage | 80 percent |
| SQL functions | 100 percent of the twelve public RPCs have at least one integration test each |
| RLS policies | 100 percent of policies have a negative test |

| Gate | Runs | Must pass |
| --- | --- | --- |
| Pre-commit | `tsc --noEmit`, `eslint`, changed-file unit tests | yes |
| Pull request | Full unit + integration, including the concurrency test | yes |
| Pre-merge to main | The above plus E2E and accessibility | yes |
| Nightly | Full suite plus load | alerts, does not block |
| Pre-deploy | `npm run verify`, already wired into `scripts/deploy.mjs --check` | yes |

## 14. The ordered plan

If only one thing gets built, build number 1.

1. **The concurrency test.** It verifies the single guarantee the product cannot
   function without, and it currently has zero coverage.
2. The Postgres test harness with the `auth` schema shim. Everything in the
   integration layer depends on it.
3. RLS negative tests, starting with "user B cannot read user A's booking".
4. Webhook replay and amount-mismatch tests.
5. Payment provider signature tests, both providers.
6. The SQL/TypeScript refund mirror-agreement table.
7. Convert the four randomised tests to `fast-check` with fixed seeds, so a
   failure is reproducible and shrunk.
8. The twelve E2E flows with axe assertions attached.
9. Load testing, particularly `search_spaces` with a time window over a
   realistic space count.
