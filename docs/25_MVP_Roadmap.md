# ParkSpace — MVP Roadmap

> Derived from `00_SPEC_KERNEL.md`. Where this document and the kernel disagree, the
> kernel wins. Document number 25.

## Shape of the plan

Twelve weeks. Six phases of two weeks each. Every phase ends with a working demonstration
against a real database, not a slide. Nothing is declared done until its definition of
done is met in full.

| Phase | Weeks | Name | Theme |
| --- | --- | --- | --- |
| P1 | 1 to 2 | Foundation | Identity, schema, the exclusion constraint, Row Level Security |
| P2 | 3 to 4 | Supply | Host onboarding, listing wizard, photos, availability, pricing |
| P3 | 5 to 6 | Discovery | Search, map, listing detail, quote, local SEO |
| P4 | 7 to 8 | Transaction | Booking, hold, payment, confirmation, cancellation, refund |
| P5 | 9 to 10 | Fulfilment | QR access, check-in, check-out, overstay, reviews, messaging, notifications |
| P6 | 11 to 12 | Operations and launch | Admin, moderation, disputes, audit, wallet, coupons, referrals, earnings, analytics, hardening |

Two principles govern sequencing.

**Supply before demand.** A marketplace with no inventory cannot demonstrate discovery, so
hosts come before drivers. Phase 2 exists so that Phase 3 has something to search.

**Correctness before surface.** The exclusion constraint, the state machine trigger and the
Row Level Security policies are built in Phase 1, before any screen depends on them. They
are the product. Everything else is an interface onto them.

---

## Phase 1: Foundation, weeks 1 and 2

### Week 1 deliverables

| # | Deliverable |
| --- | --- |
| 1.1 | Next.js 15 App Router project with TypeScript strict mode, Tailwind CSS v4, Vitest, deployed to Vercel on every push |
| 1.2 | Supabase project provisioned in an Indian region, `btree_gist` extension enabled |
| 1.3 | Core schema: `profiles`, `vehicles`, `spaces`, `space_photos`, `availability_rules`, `bookings`, `payments`, `ledger_entries`, `platform_settings` |
| 1.4 | The `bookings` table carrying `period tstzrange GENERATED ALWAYS AS (tstzrange(starts_at, ends_at, '[)')) STORED` and the `bookings_no_overlap` GiST exclusion constraint over `(space_id, bay_index, period)` filtered to `pending`, `confirmed`, `active` |
| 1.5 | Concurrency test proving two simultaneous overlapping inserts produce exactly one commit and one exclusion violation |
| 1.6 | `platform_settings` seeded with every kernel default: `HOST_COMMISSION_PCT` 0.10, `DRIVER_SERVICE_FEE_PCT` 0.05, `GST_PCT` 0.18, `BOOKING_HOLD_MINUTES` 10, `GRACE_PERIOD_MINUTES` 10, `MIN_BOOKING_MINUTES` 30, `MAX_BOOKING_DAYS` 90 |

### Week 2 deliverables

| # | Deliverable |
| --- | --- |
| 2.1 | Supabase Auth wired: email one time passcode and password, sign up, sign in, sign out |
| 2.2 | `profiles.role` and `profiles.roles`, with role switching for a user holding both `driver` and `host` |
| 2.3 | Row Level Security enabled on every table with an explicit default deny, plus a positive and negative test per policy |
| 2.4 | The location privacy policy implemented in SQL: `approx_lat` and `approx_lng` public, exact fields released only to the booking driver from 24 hours before start, and to host, `admin` and `support` |
| 2.5 | Booking state machine trigger enforcing the kernel transitions, rejecting every other transition |
| 2.6 | Pure pricing module in `lib/pricing` implementing the kernel money model in integer paise, with unit tests including rounding boundaries |
| 2.7 | Vehicle garage: add, edit, delete, default vehicle, registration normalisation |
| 2.8 | Structured logging, request correlation identifier, error taxonomy |

### Definition of done

- Two concurrent booking attempts for the same bay and overlapping interval cannot both commit, proven by an automated test running against the real database.
- An illegal booking state transition is rejected by the database, proven by test.
- An anonymous client cannot read any exact coordinate, proven by test.
- `HOST_COMMISSION_PCT` changed in `platform_settings` alters the next computed quote with no deployment.
- Pricing unit tests cover every kernel formula line with 95 percent line coverage.

### Demo at end of Phase 1

Open two terminals. Fire two overlapping booking inserts at the same bay at the same
instant. One commits, one returns `SPACE_NO_LONGER_AVAILABLE`. Then query the space as an
anonymous user and show that the response contains the jittered coordinate and nothing
else. Then change the commission in the settings table and show the quote change. The
guarantee, the privacy rule and the money model, all demonstrated before a single screen
exists.

### Dependencies

Supabase project, `btree_gist` availability, Vercel account.

### Risks

| Risk | Severity | Mitigation |
| --- | --- | --- |
| `btree_gist` unavailable or restricted on the Supabase plan | Critical, the central guarantee depends on it | Verify on day 1. If absent, escalate immediately, because there is no acceptable application-level substitute. |
| Row Level Security policies become slow on join-heavy reads | Medium | Write policies against indexed columns, measure from week 2, never leave policy performance to phase 6 |
| Time zone handling errors in `tstzrange` | High | All timestamps stored with time zone, all tests written across a daylight-free but multi-offset fixture set |

---

## Phase 2: Supply, weeks 3 and 4

### Week 3 deliverables

| # | Deliverable |
| --- | --- |
| 3.1 | Host onboarding flow: identity document, address proof, ownership or authorisation proof, bank payout details |
| 3.2 | Three Supabase Storage buckets with distinct policies: public photos, private verification, private evidence |
| 3.3 | Verification state model: `unverified`, `pending`, `verified`, `rejected`, `suspended`, with resubmission after rejection |
| 3.4 | Listing wizard steps 1 to 3: space type, capacity and bays, address with Nominatim geocode and pin confirmation |
| 3.5 | Deterministic jitter function producing `approx_lat` and `approx_lng` at 80 to 150 metres, with a test proving determinism and distance bounds |

### Week 4 deliverables

| # | Deliverable |
| --- | --- |
| 4.1 | Listing wizard steps 4 to 6: photos, pricing, availability, cancellation policy |
| 4.2 | Photo upload with content type validation, EXIF stripping, reordering, cover selection, minimum of 3 enforced at publish |
| 4.3 | Availability engine: weekly recurring schedule, date overrides, blackout dates, bay maintenance blocks |
| 4.4 | Availability computation function returning bookable intervals as schedule minus existing `pending`, `confirmed` and `active` bookings |
| 4.5 | Pricing editor: hourly, daily, overnight, monthly, event rates, plus the manual day-type multiplier |
| 4.6 | Draft persistence at every wizard step, resumable across sessions |
| 4.7 | Publish gate enforcing all preconditions and naming every unmet one at once |
| 4.8 | Seed script creating 40 realistic Kolkata listings across the six launch neighbourhoods |

### Definition of done

- A host completes onboarding, uploads documents, is verified by a manual database update, creates a listing and publishes it, in under 25 minutes.
- Availability for a listing with capacity 3 correctly reports free bay counts for any queried interval.
- Every uploaded photo is EXIF-free when downloaded from the public bucket.
- Verification documents are unreadable by any anonymous or unrelated authenticated request.
- 40 seeded listings exist with plausible coordinates, prices and availability.

### Demo at end of Phase 2

Create a host account from scratch on camera. Upload documents. Verify. Walk the listing
wizard end to end, drag the pin to a real Park Street gate, upload three photos, set a
weekly evening-only schedule with one blackout date, price it, publish it. Then open the
database and show that the public row exposes only the jittered coordinate, and that the
jitter is between 80 and 150 metres from the true pin.

### Dependencies

Phase 1 complete. Nominatim reachable. Supabase Storage configured.

### Risks

| Risk | Severity | Mitigation |
| --- | --- | --- |
| Nominatim rate policy breached during development | High, could cause a block | Proxy and cache from day one of week 3, never call upstream from a browser, throttle to one request per second globally |
| The listing wizard becomes long enough that hosts abandon it | High, supply is the hard side | Draft at every step, measure step-level drop-off from week 4, cut optional fields aggressively |
| Availability computation becomes the slowest query in the system | Medium | Benchmark against the seeded 40 listings in week 4, index before phase 3 depends on it |

---

## Phase 3: Discovery, weeks 5 and 6

### Week 5 deliverables

| # | Deliverable |
| --- | --- |
| 5.1 | Search API: text location through the geocode proxy, bounding box, start and end time, distance ordering, stable cursor pagination |
| 5.2 | Search filters: price ceiling, vehicle size class, covered or open, amenities, instant book, radius |
| 5.3 | MapLibre GL map with OpenStreetMap raster tiles, no key required |
| 5.4 | Markers at jittered coordinates only, clustering above the density threshold, explicit "search this area" control |
| 5.5 | Bidirectional list and map linking, plus a keyboard-reachable list-only mode |

### Week 6 deliverables

| # | Deliverable |
| --- | --- |
| 6.1 | Listing detail page, server rendered, with photos, amenities, price table, policy, host summary, availability calendar |
| 6.2 | Jittered map with radius indicator and the explicit "exact address released after booking" statement |
| 6.3 | Quote API returning every money component separately, computed server side in paise |
| 6.4 | Quote UI with the full breakdown, visible before any account is required |
| 6.5 | Local SEO pages: one per launch neighbourhood, one per landmark, server rendered with unique content, structured data, sitemap and canonical tags |
| 6.6 | Legal pages: terms, privacy, cancellation, host agreement |
| 6.7 | Landing page with search entry, neighbourhood tiles and host recruitment call to action |
| 6.8 | Performance pass: search p95 under 400 ms server time, map first paint under 1.5 s |

### Definition of done

- A visitor with no account searches "Park Street", sees results on a map and in a list, opens a listing and sees a complete, itemised price quote.
- No response on any public surface contains an exact coordinate or full address, verified by an automated payload assertion.
- Search p95 server time is under 400 ms against the seeded dataset.
- Six neighbourhood pages render with unique titles and content and appear in the sitemap.
- The entire search and quote flow is completable using a keyboard alone.

### Demo at end of Phase 3

Search for Park Street on a phone. Pan the map, press "search this area", watch the list
update. Open a listing. Show the radius circle and the privacy statement. Request a quote
for Saturday 7 pm to 11 pm and show the breakdown: base, discount, taxable, service fee,
tax, total, every figure derived from the settings table. Then tab through the whole flow
with no mouse.

### Dependencies

Phase 2 complete with seeded supply. OpenStreetMap tiles reachable.

### Risks

| Risk | Severity | Mitigation |
| --- | --- | --- |
| Availability-aware search is too slow with time filtering | High | Index `(space_id, bay_index, period)` with GiST, and the space location with a spatial index, in week 5 not week 6 |
| Map bundle inflates the search page beyond the payload budget | Medium | Load MapLibre only on map routes, code split, measure in week 5 |
| Tile provider throttles the deployment | Medium | Cache aggressively, respect the tile usage policy, keep the tile URL a single configurable value |

---

## Phase 4: Transaction, weeks 7 and 8

### Week 7 deliverables

| # | Deliverable |
| --- | --- |
| 7.1 | Hold creation: a `pending` booking taking the exclusion constraint at checkout entry |
| 7.2 | Hold expiry scheduled job running every minute, moving expired holds to `expired` and releasing intervals |
| 7.3 | Hold countdown in the UI with a warning at 2 minutes remaining, announced to assistive technology |
| 7.4 | Bay allocation for `capacity > 1`, never leaving `bay_index` null on a confirmed booking |
| 7.5 | Quote freeze onto the booking at hold creation |
| 7.6 | Payment provider abstraction, mock provider complete and passing the whole loop with no credentials |
| 7.7 | Idempotent payment initiation keyed on a client-supplied idempotency key, proven against a double-clicked pay button |

### Week 8 deliverables

| # | Deliverable |
| --- | --- |
| 8.1 | Razorpay adapter behind the same interface, selected by configuration |
| 8.2 | Webhook ingress with signature verification, event identifier deduplication and out of order tolerance |
| 8.3 | Confirmation only on a verified provider signal, never on a client callback |
| 8.4 | Reconciliation job matching provider payments against local bookings, alerting on any mismatch |
| 8.5 | The four cancellation policies implemented exactly as the kernel states, with a refund preview before commit |
| 8.6 | Refund engine: service fee retained on driver cancellation, refunded on host cancellation, host reliability penalty applied |
| 8.7 | Idempotent refund issuance |
| 8.8 | Append-only ledger with a nightly integrity check asserting a zero paise imbalance |
| 8.9 | Request to book flow with host response window and automatic expiry |

### Definition of done

- The full booking loop completes on the mock provider with no gateway account configured.
- A duplicated webhook confirms one booking and sends one email.
- A webhook arriving after hold expiry triggers an automatic full refund within 15 minutes.
- A double-clicked pay button produces exactly one charge.
- All four cancellation policies produce refunds matching hand-calculated expected values, to the paise.
- The nightly ledger integrity check reports exactly zero imbalance.

### Demo at end of Phase 4

Book a space end to end on the mock provider. Then break it deliberately: replay the same
webhook twice and show one confirmation. Let a hold expire while a payment is in flight and
show the automatic refund. Cancel under each of the four policies and show the refund
arithmetic, service fee retained on the driver cancellation and refunded on the host
cancellation. Finally, run the nightly ledger check live.

### Dependencies

Phase 3 complete. A scheduled job runner. Razorpay test credentials, optional.

### Risks

| Risk | Severity | Mitigation |
| --- | --- | --- |
| The hold expiry job fails silently and inventory starves | Critical | Alert if no successful run in 5 minutes, from the day the job ships |
| Money arithmetic errors reach production | Critical | Integer paise only, property-based tests over the pricing module, hand-calculated fixtures for every policy |
| Webhook edge cases discovered after launch instead of before | High | Build a webhook replay harness in week 8 that injects duplicates, late arrivals and out of order events as a standard test |
| Razorpay integration blocks the schedule | Medium | The mock provider is the MVP requirement. Razorpay is the stretch. The loop must be demonstrable without it. |

---

## Phase 5: Fulfilment, weeks 9 and 10

### Week 9 deliverables

| # | Deliverable |
| --- | --- |
| 9.1 | QR access pass with a signed, booking-scoped token containing no address or personal data |
| 9.2 | Exact location release enforced by Row Level Security from 24 hours before start, to the booking driver only |
| 9.3 | Check-in within the grace window, by QR scan or by a 6 digit manual code |
| 9.4 | Host and staff gate scan view, exposing registration, bay and interval only |
| 9.5 | Check-out, recording the actual time and moving the booking to `completed` |
| 9.6 | No-show sweep moving a `confirmed` booking to `no_show` when the grace period elapses without check-in |
| 9.7 | Overstay detection, notification to both parties, and overstay charge computation in whole increments |

### Week 10 deliverables

| # | Deliverable |
| --- | --- |
| 10.1 | Booking extension, permitted only when the following interval on the same bay is free, priced as an appended quote |
| 10.2 | Two-sided reviews with a 14 day window, withheld until both are submitted or the window closes |
| 10.3 | Aggregate rating recomputation on publish and on removal |
| 10.4 | Booking-scoped messaging with contact redaction before confirmation and thread closure 7 days after terminal state |
| 10.5 | Notification system: in-app centre, email, optional SMS, per-user channel preferences, idempotent dispatch |
| 10.6 | The full notification set: confirmation, 24 hour reminder, check-in reminder, overstay alert, cancellation, refund, review request, payout |
| 10.7 | Driver dashboard: upcoming, active, past, cancelled, saved spaces |
| 10.8 | Host dashboard: today's arrivals and departures, pending requests, unread messages, month and week calendar |

### Definition of done

- A driver books, receives a pass, checks in at the gate with a host scanning, checks out and reviews, with every state transition recorded.
- The exact address is provably absent 25 hours before start and provably present 23 hours before start, for the same booking and the same user.
- A booking with no check-in becomes `no_show` automatically at the end of the grace period.
- An overstay of 75 minutes on a 30 minute increment produces a charge of exactly 3 increments.
- No notification is sent twice for the same event, proven by a retried dispatch job.

### Demo at end of Phase 5

Run a compressed real booking. Book a space starting in 5 minutes. Show the address
hidden, then released. Walk to a second device acting as the gate, scan the QR, watch the
booking go `active`. Check out. Receive the review request. Submit both reviews and watch
the listing rating recompute. Then let a second booking run past its end time and show the
overstay alert and charge.

### Dependencies

Phase 4 complete. Email provider configured. Camera-capable device for the scan demo.

### Risks

| Risk | Severity | Mitigation |
| --- | --- | --- |
| Camera scanning unreliable in low light at real gates | High, this is the physical moment of truth | The 6 digit manual code is a first-class path, not a fallback, and is tested at a real gate in week 10 |
| The 24 hour location release boundary has an off by one error | Critical, it is the privacy rule | A dedicated test suite with fixtures at 25 hours, 24 hours 1 minute, 23 hours 59 minutes and 23 hours |
| Notification volume annoys users into disabling all channels | Medium | Per-channel preferences from the start, and a strict list of which notifications are transactional |

---

## Phase 6: Operations and launch, weeks 11 and 12

### Week 11 deliverables

| # | Deliverable |
| --- | --- |
| 11.1 | Admin panel: dashboard with the North Star Metric, GMV, take rate, live supply and queue depths |
| 11.2 | Host verification queue with approve, reject with reason and request more information |
| 11.3 | Listing moderation queue, photo moderation, review removal with mandatory reason |
| 11.4 | User management: search, view, suspend and restore with mandatory reason |
| 11.5 | Refund console with reason codes, and admin forced state transitions flagged as overrides |
| 11.6 | Dispute queue: raise, evidence upload to the private bucket, payout hold, resolution with amount and rationale |
| 11.7 | Append-only audit log, immune to update and delete for every role, queryable by actor, entity and time |
| 11.8 | Platform settings editor with before and after values captured in the audit log |

### Week 12 deliverables

| # | Deliverable |
| --- | --- |
| 12.1 | Wallet: paise balance, append-only ledger, reservation during hold, release on expiry, never negative under concurrency |
| 12.2 | Coupons: percentage and fixed, caps, validity, global and per-user redemption limits enforced atomically |
| 12.3 | Referrals: unique codes, attribution at signup, credit on the referee's first completed booking, monthly cap |
| 12.4 | Host earnings: gross, commission, net, pending against available, dispute holds, withdrawal requests, settlement statement |
| 12.5 | Analytics event pipeline implementing the taxonomy in `28_Analytics_Requirements.md`, with the role dashboards |
| 12.6 | Accessibility pass to WCAG 2.2 AA, including the map-specific criteria, with a manual screen reader run of the booking flow |
| 12.7 | Performance pass against every budget in `09_Non_Functional_Requirements.md` |
| 12.8 | Alerting for every always-alertable condition, with a tested page path |
| 12.9 | Backup restore drill into a scratch project, with verification queries |
| 12.10 | Launch readiness review against the kernel, and go-live for the Park Street neighbourhood |

### Definition of done

- Every MVP item in kernel section 11 is present and working.
- Every always-alertable condition in `09_Non_Functional_Requirements.md` fires a real page in a test.
- A restore drill has succeeded and its duration is recorded against the 4 hour RTO.
- The accessibility audit reports no Level AA failures on public, driver or host surfaces.
- Every performance budget is met or has a recorded, accepted exception with an owner.
- Zero overlapping bookings exist in the nightly integrity query.

### Demo at end of Phase 6

The whole marketplace, in one session. A host lists a space. An admin verifies and
moderates it. A driver searches, quotes with a coupon and wallet credit applied, books,
pays, receives a pass, checks in, checks out and reviews. The host sees the earning move
from pending to available and requests a payout. A dispute is raised, evidence is
uploaded, an admin resolves it and the payout adjusts. Then open the analytics dashboard
and show completed parking hours for the week, the North Star Metric, computed from real
events generated during the demo.

### Dependencies

All prior phases. Email provider. Alerting destination. A scratch Supabase project for the
restore drill.

### Risks

| Risk | Severity | Mitigation |
| --- | --- | --- |
| Accessibility debt accumulated across five phases lands as a week 12 emergency | High | Automated accessibility checks run in continuous integration from Phase 1, not from Phase 6 |
| Admin surface is scoped as a large application and consumes both weeks | High | Admin is a set of tables with actions, not a designed product. Use one table component everywhere. |
| Launch readiness reveals a kernel violation late | Critical | Run the kernel conformance checklist at the end of every phase, not only at the end |
| Supply density target not met, so launch has nothing to sell | Critical | Supply recruitment runs in parallel from week 3, owned by growth, tracked weekly against the 150 space target |

---

## Cut-list: what gets dropped, in order

If the schedule slips, cut from the top of this list. Do not negotiate item by item, and do
not cut out of order. The ordering encodes the judgement that correctness, the booking
loop and trust are the product, and everything else is an accelerant.

| Order | Item | Phase | Why it is safe to cut |
| --- | --- | --- | --- |
| 1 | Referrals | P6 | Growth mechanism with zero users to refer at launch |
| 2 | Coupons | P6 | Discounting has no purpose before there is demand to convert |
| 3 | Wallet | P6 | Refunds go to the original payment method, which is the correct default anyway |
| 4 | Booking extension | P5 | The driver books a new booking instead. Inconvenient, not blocking. |
| 5 | Downloadable settlement statement | P6 | The earnings screen already shows every figure |
| 6 | Marker clustering | P3 | Launch density is under 300 listings per viewport, individual markers render acceptably |
| 7 | Landmark SEO pages | P3 | Neighbourhood pages carry the local search value. Landmarks are a long tail. |
| 8 | SMS notification channel | P5 | Email plus in-app covers every transactional need |
| 9 | Message contact redaction | P5 | Replaced by a policy notice in the thread and manual moderation |
| 10 | Operator staff seats | P2 | The operator uses the host account until V2. Affects a small number of accounts. |
| 11 | Simultaneous review reveal | P5 | Publish reviews immediately instead. Slightly worse incentives, no functional loss. |
| 12 | Request to book | P4 | Ship instant book only. Hosts who want approval do not list yet. |
| 13 | Host reliability score | P4 | Cancellation reasons are still recorded and are visible to admin |
| 14 | Razorpay adapter | P4 | The mock provider demonstrates the entire loop. This is the last technical cut. |
| 15 | Admin analytics charts | P6 | Replace with SQL views the team queries directly |

**Never cut, under any circumstance:** the exclusion constraint, the state machine trigger,
Row Level Security, the location privacy rule, integer paise arithmetic, webhook idempotency,
the hold expiry job, the ledger integrity check, the audit log, or the accessibility floor
for keyboard operability. Cutting any of these does not produce a smaller product. It
produces a broken one.

---

## V2 outline, months 4 to 9

V2 assumes the Kolkata density target has been met and the North Star Metric is growing
week on week without paid acquisition.

| Theme | Content |
| --- | --- |
| Recurring and monthly inventory | First-class monthly contracts, recurring weekday reservations, prorated changes, auto-renewal with notice |
| Operator suite | Multi-location dashboards, staff seats with scoped permissions, shift handover, per-location reporting, bulk availability editing |
| Demand shaping | Rules-based dynamic pricing suggestions from real utilisation data, host-accepted, never automatic |
| Payouts automation | Automated bank payouts on a schedule, settlement reconciliation, host tax documents once the accounting position in OQ1 is settled |
| Trust deepening | Automated identity verification, vehicle registration verification, host insurance partnership, graduated trust levels |
| Driver retention | Saved searches with availability alerts, favourite hosts, a loyalty balance, one-tap rebooking of a previous space |
| Web push notifications | Replacing the SMS dependency for reminders and gate alerts |
| Second city | Whichever of the candidate metros the demand data supports. Region is already a column, so this is supply recruitment, not engineering. |
| Accessibility and localisation | Bengali and Hindi catalogues, full right to left readiness carried forward |

## V3 outline, months 10 to 18

V3 assumes two or more cities at density and a repeatable supply acquisition motion.

| Theme | Content |
| --- | --- |
| Hardware where it pays for itself | Smart locks and boom barrier integration for high-volume operator lots only, behind the same access interface the QR pass already uses |
| Occupancy truth | Sensor integration for lots where guaranteed availability is worth the capital cost |
| Learned pricing | Machine-learned price recommendations, trained on the transaction history V1 and V2 created, still host-accepted |
| Corporate | Employer parking benefits, corporate accounts, consolidated invoicing, SaaS billing for operators |
| Native applications | iOS and Android, justified by gate-side latency and offline pass reliability rather than by fashion |
| EV | Charging availability as bookable inventory, metering through partner hardware |
| Marketplace intelligence | Neighbourhood-level supply and demand forecasting, host earnings projections, expansion targeting |
| Platform | Public API and partner integrations for event venues, hotels and navigation applications |

Every V3 item is explicitly out of scope for the MVP in kernel section 11. Nothing here
is a reason to add scope to the twelve weeks.
