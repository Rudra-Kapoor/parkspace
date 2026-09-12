# Verification report

What was actually run against this project, and what the results were. Recorded so a
reader can tell the difference between what is claimed and what is checked.

Last updated: 12 September 2026, after first deployment.

## Status

The application is deployed, connected to a live Postgres, and serving real data.

| | |
| --- | --- |
| Repository | `Rudra-Kapoor/parkspace`, private |
| Deployment | `parkspace-nine.vercel.app` |
| Database | Supabase project `cyflmvtpsmodtcmxrcve`, region `ap-south-1` (Mumbai) |
| Migrations applied | 14 of 14 |
| Seeded | 5 listings, 70 bays, 5 hosts, 2 drivers, 1 admin |

## Automated checks

| Suite | Command | Checks | Result |
| --- | --- | --- | --- |
| Unit, pure functions | `npm test` | 49 | Pass |
| Concurrency and privacy, live database | `npm run test:concurrency` | 17 | Pass |
| End-to-end flow, as a real driver | `npm run test:flow` | 28 | Pass |
| Type safety | `npm run typecheck` | | Clean |
| Production build | `npm run build` | 24 pages prerendered | Clean |

94 assertions in total.

## The central claim is now proven, not argued

The design rests on one guarantee: two drivers cannot both be sold the same bay over
overlapping time. Until deployment that was reasoning about Postgres semantics. It is
now measured.

`scripts/test-concurrency.mjs` fires genuinely concurrent transactions, each on its own
connection, against the live database.

| Scenario | Expected | Observed |
| --- | --- | --- |
| 24 concurrent inserts, identical interval, one bay | exactly 1 commits | 1 committed, 23 rejected with SQLSTATE 23P01 |
| 24 staggered but overlapping intervals | exactly 1 commits | 1 committed |
| Two bookings meeting exactly at time T | both commit | both committed |
| 14 attempts on an 8 bay space | exactly 8 commit | 8 committed |
| A cancelled booking | releases its bay at once | released |

The third row matters as much as the first. It proves the half-open range is correct and
the constraint is not over-eager: a booking ending at 14:00 and one starting at 14:00
must both succeed, because the outgoing car leaves as the incoming one arrives. A
constraint that blocked that would be quietly refusing legitimate money.

## The location privacy rule is enforced by the database

Asserted from an unprivileged client against the live database:

| Assertion | Result |
| --- | --- |
| The public view exposes no address, exact coordinate or access instructions | 5 listings read, 0 leaked |
| An approximate coordinate is still published, so the map works | present |
| Selecting `address_line` off the base table as an anonymous client | refused, SQLSTATE 42501 |
| An anonymous client reading bookings | 0 rows |
| A pending hold releases the address | no |
| A confirmed booking more than 24 hours out releases the address | no |
| The same listing, to a visitor with no booking, after another user books it | still hidden |

## Authorization boundaries, tested from the attacker's side

Signed in as a real driver against the live database:

| Attempt | Result |
| --- | --- |
| Read another user's bookings | 0 visible |
| Set own role to `admin` | refused, role unchanged |
| Credit own wallet balance | refused, balance unchanged |
| Insert a booking directly, bypassing the engine | refused |

## Bugs found by deploying, that review had not caught

Six, and none of them were findable without a real database and a real unprivileged
request. They are listed because the pattern is the point: each one was invisible to
every check that came before it.

### 1. A reserved word broke every booking operation

`by` cannot be a plpgsql variable name. `cancel_booking` declared one in three
migrations, so migration 0007 failed outright and nothing after it applied. Found on the
first `db:push`. Fixed by renaming to `v_by`.

### 2. Search returned HTTP 500 for every visitor

Migration 0008 revoked `SELECT` on `parking_spaces` from the client roles, which is what
makes the privacy rule structural. But `search_spaces` was left `SECURITY INVOKER`, so it
executed with the caller's privileges and hit the very revoke meant to protect the table.

### 3. Availability was silently wrong, which was worse

`count_free_bays` and `next_free_bay` read the bookings table and were also
`SECURITY INVOKER`. Row Level Security restricts a caller to their own bookings, so for
any driver looking at somebody else's space the subquery matched zero rows and a fully
booked space was reported as completely free.

Nobody would ever have been double-booked, because the exclusion constraint is the last
line and it holds. But the product would have advertised parking it could not sell, and
the driver would have discovered it only at the final insert. **The constraint cannot
protect against being wrong at the first line.**

Every test that existed at the time passed while this bug was live, because they all ran
with the service role. Test 7 in the concurrency suite is the regression test, and it
asserts against an unprivileged client for exactly that reason.

### 4. The service role silently lost its writes

The column guard triggers pin privileged columns unless `is_full_admin()` passes, and
that reads `auth.uid()`, which the service role does not carry. Every privileged write it
made was reverted rather than rejected, so the seed script appeared to succeed while
quietly failing to make anybody a host. Found by review before deployment, confirmed by
the live data afterwards: 5 hosts, 2 drivers, 1 admin, all correct.

### 5. The public pages could not render

The landing page and the neighbourhood pages both set `revalidate` and then called the
cookie-reading Supabase client. Reading cookies opts a page out of static rendering, so
the combination fails at render time in Next.js 15. The neighbourhood pages returned 500.
The landing page returned 200 and looked fine, because a try/catch swallowed the error
and rendered it with no data at all. The silent failure was the more dangerous one.

### 6. Availability depended on a scheduler

Vercel's Hobby plan caps cron at once daily, which exposed a design weakness rather than
just a platform limit. Abandoned payment holds participate in the exclusion constraint,
so a hold kept its bay locked until the sweeper ran. On a daily schedule one driver
closing a tab would have taken a bay out of the market for up to 24 hours.

Fixed properly: `create_booking_hold` now releases expired holds on the target space
before it books, and the availability reads ignore lapsed holds. A missed cron now costs
tidiness, never availability.

## What is still NOT verified

Being explicit about this matters more than the list above.

| Not verified | What it would take |
| --- | --- |
| The web API routes under load | The flow test exercises the database functions directly. The HTTP routes are thin wrappers over them, but thin is not zero, and no test drives them through a browser session. |
| Razorpay | Written against the documented REST API and never called against the live service, not even in test mode. The payment provider in this deployment is the mock. |
| Refunds actually returning money | `cancel_booking` computes the split correctly and writes a `refunds` row. Neither provider's `refund()` is called anywhere. |
| Payouts | Earnings accrue correctly. No payout is created and no money reaches a host. |
| Extensions being charged | `extend_booking` adds to the booking total and creates no payment intent, so an extension is free. |
| Overstay collection | Computed and recorded, never collected. The auto-complete sweeper also back-dates checkout to the original end, so a driver who overstays and never taps checkout is billed nothing. |
| Notification delivery | Rows are queued with correct scheduling and deduplication. No provider is connected and nothing is sent. |
| Accessibility | Built with care: focus is never hidden, the map has a keyboard-accessible list equivalent, the star rating is radio buttons, every form control is labelled. No screen reader pass and no automated audit has been run. |
| Performance under load | The budgets in `09_Non_Functional_Requirements.md` are targets, not measurements. |
| Photo upload | Schema and display path complete. No upload UI, so seeded listings have no photos. |

The honest summary: the inventory engine, the authorization model and the privacy rule
are now tested against a real database at a real privilege level and they hold. The money
flows inward correctly and does not yet flow back out. Nothing in the outbound half
should be trusted until it is built and tested the same way.
