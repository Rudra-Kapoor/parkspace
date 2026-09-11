# Verification report

What was actually run against this repository, and what the results were. Recorded so
a reader can tell the difference between what is claimed and what is checked.

Date: 12 September 2026.

## Automated checks

| Check | Command | Result |
| --- | --- | --- |
| Type safety | `npx tsc --noEmit` | Clean. Zero errors across the whole repository, with `strict` and `noUncheckedIndexedAccess` enabled. |
| Unit tests | `npx vitest run` | 49 passed, 2 files, 0 failed. |
| Production build | `npm run build` | Compiled successfully. 75 routes. 16 static pages generated. |
| Deployment readiness | `node scripts/deploy.mjs --check` | Runs and correctly reports missing preconditions. |

### What the 49 tests cover

`src/lib/money.test.ts`, 28 tests:

- The paise guard rejects a decimal rupee value, which is the specific bug it exists
  for: someone passing `12.5` meaning rupees.
- Rupee conversion rounds rather than truncates, and survives `0.1 + 0.2`.
- Basis point arithmetic, including rejecting a fractional rate passed by mistake.
- `splitPaise` and `splitPaiseByWeights` preserve the total exactly, verified over
  200 random cases each.
- `computeBreakdown` matches the documented Rs 300 example: the driver pays Rs 317.70,
  the host receives Rs 270, the platform earns Rs 45.
- A wallet credit does not reduce the host's payout, asserted directly.
- Over 500 random inputs, no component goes negative and total always equals taxable
  plus fee plus tax.
- Indian digit grouping: 12,34,567 rather than 1,234,567.

`src/lib/policy.test.ts`, 21 tests:

- All four cancellation policies at and around their cutoffs, against the Rs 500
  worked example from `23_Refund_Policy.md`.
- Host and platform cancellation refund the driver in full including the service fee,
  under every policy.
- The forfeit split pays the host their normal share, because they held the bay.
- Wallet credit returns to the wallet in proportion to the cash refund, never more
  than was applied.
- Over 400 random combinations of amount, policy, cancelling party and timing: a
  refund never exceeds what was paid, nothing goes negative, and every paise of a
  forfeit is accounted for between host and platform.
- Overstay is charged from the original end time, not from the end of grace.
- The check-in window opens exactly 30 minutes early.

## Manual smoke test

A production build was started and requested over HTTP with **no database configured**,
which is the state of a fresh clone.

| Request | Result |
| --- | --- |
| `GET /` | 200, and renders the setup notice rather than a stack trace |
| `GET /how-it-works` | 200 |
| `GET /help` | 200 |
| `GET /legal/refunds` | 200 |
| `GET /legal/host-terms` | 200, and renders the unreviewed-draft warning |
| `GET /search?lat=22.55&lng=88.35` | 200, renders with an empty result set |
| `GET /robots.txt` | Correct disallow list |
| `GET /api/geocode?q=Park Street Kolkata` | 200, returned Park Street, Dharmatala, Kolkata, West Bengal 700087 from the live Nominatim service. India biasing works. |
| `GET /api/cron` without a secret | 503, refuses to run |

## Two bugs found by review and fixed

Neither was found by running the code. Both were found by reading migration 0008
against the operations in 0007 and 0009, and both would have surfaced the first time
a real user touched the product.

### 1. Every booking operation was blocked

`bookings_guard_direct_update` refused any status change unless the caller was an
admin. Its own comment claimed it detected a legitimate call "by the absence of the
marker the RPCs set", but no marker was ever implemented.

`SECURITY DEFINER` changes the privileges a function runs with. It does not change
`auth.uid()`. So inside `cancel_booking` the guard still saw an ordinary driver and
raised `insufficient_privilege`.

Affected: `cancel_booking`, `check_in_booking`, `check_out_booking`, `confirm_booking`,
`extend_booking`, `expire_stale_holds`, `auto_complete_stale_bookings`. In other words,
every state transition in the product after the initial hold.

Fixed in `0010_fix_guard_triggers.sql`. Each operation now calls
`begin_booking_operation()`, which sets a transaction-local setting the guard honours.
Transaction-local matters: it is discarded at commit or rollback, so it cannot leak
into a later statement on a pooled connection. The function is revoked from every
client role, because a marker a client could set would not be a guard.

### 2. The service role silently lost its writes

`profiles_guard_privileged_columns` and its siblings pin privileged columns to their
old values unless `is_full_admin()` passes, and that function reads `auth.uid()`. The
service role carries no `auth.uid()`, so it failed the check and every privileged write
it made was reverted rather than rejected.

The seed script therefore appeared to succeed while quietly failing to make anybody a
host. A silent revert is considerably worse than a refusal, because nothing surfaces
until someone wonders why the host dashboard is empty.

Fixed in the same migration by recognising a service-role or direct database connection
explicitly through `is_privileged_connection()`.

The parallel agent building the host dashboard independently hit the same issue and
reported it, which is corroboration rather than coincidence.

## One gap closed

`0011_grant_rejection_reason.sql`. When migration 0008 revoked blanket `SELECT` on
`parking_spaces` and granted an explicit column list instead, `rejection_reason` was
left out by oversight. The effect was that a host whose listing was rejected could see
the rejected badge but not the reason, which is the one piece of information that would
let them fix it.

The migration ends with an assertion that raises if any of `address_line`, `landmark`,
`lat`, `lng`, `access_instructions` or `access_pin` ever becomes readable by the
`authenticated` role, so the privacy grant cannot be widened by accident in future.

## What has NOT been verified

Being explicit about this matters more than the list above.

| Not verified | Why, and what it would take |
| --- | --- |
| The migrations applying to a real Postgres | No database was available in this environment. `npm run db:push` has not been run end to end. The SQL is written against documented Postgres behaviour but has not been executed. |
| The exclusion constraint under real concurrency | This is the central claim of the design and it deserves a dedicated test: N parallel transactions attempting the same bay, asserting exactly one commits. `26_Testing_Strategy.md` describes how to write it. It has not been run. |
| Row Level Security policies in practice | The policies are written and reasoned about, but no test asserts that user A cannot read user B's booking. That test should exist before launch. |
| The complete booking flow against live data | The flow is implemented and the build is clean, but no booking has actually been created, paid for and confirmed against a real database. |
| Razorpay integration | Written against the documented REST API. Never called against the live service, not even in test mode. |
| Accessibility | Built with care: focus is never hidden, the map has a full keyboard-accessible list equivalent, the star rating is radio buttons, forms are labelled. No screen reader pass and no automated audit has been run. |
| Load and performance | The performance budgets in `09_Non_Functional_Requirements.md` are targets, not measurements. |

The honest summary is that this compiles, tests clean, builds, boots and serves pages,
and the logic that can be tested without a database is tested thoroughly. The database
layer is carefully written and carefully reviewed, and the next step before trusting it
is to apply it to a real Postgres and run the concurrency test.
