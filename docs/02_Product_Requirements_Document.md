# ParkSpace — Product Requirements Document

> Derived from `00_SPEC_KERNEL.md`. Where this document and the kernel disagree, the
> kernel wins. Document number 02. Status: baseline for the 12 week MVP.

---

## 1. Problem statement

Parking in an Indian metro is a market failure of information, not a failure of supply.

On the demand side, a driver approaching Park Street at 7 pm on a Friday has no way to
know, before committing to the drive, whether a space exists within walking distance of
the destination. The driver circles. Circling is the default behaviour because it is the
only behaviour available. The cost of circling is paid three times over: in the driver's
time, in fuel, and in congestion imposed on every other road user. When the driver
finally parks, it is frequently in an arrangement with no receipt, no guarantee that the
vehicle will still be accessible at the promised hour, and no recourse if it is not.

On the supply side, an enormous quantity of parking capacity sits idle on a predictable
schedule. An office building in Salt Lake Sector V has bays that are full from 10 am to
7 pm on weekdays and completely empty every evening and every weekend. A residential
apartment block in Ballygunge has allocated bays whose owners are at work. A hotel near
Esplanade has overflow capacity it never fills outside the wedding season. Each of these
owners has an asset with a non-zero marginal value and no mechanism to sell it. The
barrier is not willingness. The barrier is that transacting requires discovery,
scheduling, trust, payment, access control and dispute handling, and no single owner can
build that alone.

ParkSpace is the mechanism. It is a two-sided marketplace that lets people and businesses
monetise unused parking capacity, and lets drivers discover, reserve, pay for and access a
guaranteed parking space before they arrive.

### Why this is hard, stated honestly

1. **Guarantee is the product.** A booking that is not honoured is worse than no booking,
   because the driver has now committed to a destination on the strength of a promise. The
   system must make double-booking structurally impossible rather than statistically
   unlikely. The kernel solves this with a Postgres GiST exclusion constraint over
   `(space_id, bay_index, period)`, not with application-level locking.
2. **Trust runs in both directions.** The driver is trusting a stranger with vehicle
   access. The host is trusting a stranger with property access. Both sides need
   verification, both sides need reviews, and both sides need a dispute path.
3. **Density beats coverage.** A marketplace with 5,000 listings spread over 30 cities is
   useless to every one of its users. A marketplace with 150 listings inside a 2 km radius
   of Park Street is useful to everyone inside that radius. The kernel fixes the first
   market as Kolkata and the density target at 150 live spaces inside 2 km.
4. **Money must be exact.** Every amount is an integer number of paise in a `bigint`.
   Floating point money is a defect, not a shortcut.

---

## 2. Goals

| # | Goal | Measured by |
| --- | --- | --- |
| G1 | Make a guaranteed space bookable before the driver leaves | Successfully completed parking hours per week, the North Star Metric |
| G2 | Make double-booking structurally impossible | Zero overlapping confirmed bookings on the same bay, verified by a nightly integrity query |
| G3 | Make hosts money without operational effort | Median host time from listing start to first confirmed booking |
| G4 | Achieve supply density in six named Kolkata neighbourhoods | Live spaces per neighbourhood, target 150 inside a 2 km radius of Park Street |
| G5 | Keep the exact location private until it is legitimately needed | Zero exposures of `exact_lat` outside a confirmed booking window, verified by RLS test suite |
| G6 | Make the whole loop demonstrable at zero infrastructure cost | The mock payment provider completes the full booking loop with no gateway account |

---

## 3. Non-goals

These are explicit refusals for the MVP. They are not backlog items awaiting
prioritisation. They are decisions.

| # | Non-goal | Reason |
| --- | --- | --- |
| NG1 | Smart locks, gate hardware, boom barrier integration | Hardware procurement and field installation are a different business. Access is a QR code and a human. |
| NG2 | Licence plate recognition | Requires camera installation per site and introduces a biometric-adjacent data class. |
| NG3 | Occupancy sensors | Same hardware problem. Occupancy is derived from booking state, not from sensing. |
| NG4 | Machine-learned dynamic pricing | We have no transaction history to learn from. Pricing is a rules table with a manual multiplier. |
| NG5 | EV charging hardware integration | An amenity flag on the listing is sufficient. Metering is out. |
| NG6 | Valet | An operational service business, not a marketplace feature. |
| NG7 | Corporate SaaS billing and white label | Requires contract, invoicing and procurement surfaces that do not exist yet. |
| NG8 | Multi-country payments and multi-currency | INR only. The money model assumes a single currency. |
| NG9 | Native mobile applications | The web app is responsive and installable. Native follows product-market fit, not precedes it. |
| NG10 | Native mobile push notifications | Notification channels are in-app, email and optional SMS. Web push is a V2 candidate. |
| NG11 | Host-to-host or driver-to-driver social features | Messaging exists only inside a booking context. |
| NG12 | Real-time turn-by-turn navigation inside the app | We hand off to OSRM or an OpenStreetMap deep link. |

---

## 4. Personas

| Persona | Role enum | One line |
| --- | --- | --- |
| Commuter Driver | `driver` | Books the same bay near the office every weekday morning and wants a monthly recurring reservation with no repeated effort. |
| Event Driver | `driver` | Books once, for a concert or a wedding, cares about walking distance and predictable exit time, and will never return unless the first experience is flawless. |
| Resident Host | `host` | Owns one or two bays in an apartment block, wants passive income, will not tolerate phone calls at 11 pm. |
| Business Host | `host` | Owns a small lot or a hotel forecourt with 5 to 30 bays, wants yield management and a settlement statement. |
| Operator | `operator` | Runs parking across several locations, needs staff seats, per-location reporting and gate-side check-in by an attendant. |
| Admin | `admin` | Verifies hosts and spaces, moderates content, issues refunds, resolves disputes and changes platform settings. |
| Support | `support` | Reads everything, changes nothing except dispute records and messages to users. |

---

## 5. Feature inventory by surface

### 5.1 Public surface, no authentication required

| Feature | Notes |
| --- | --- |
| Landing page | Value proposition, search entry, neighbourhood tiles, host recruitment call to action |
| Search by location text | Nominatim geocoding, proxied server side, cached, rate limited to one request per second upstream |
| Search by map viewport | MapLibre GL with OpenStreetMap raster tiles, results bound to the visible bounding box |
| Search filters | Date and time window, vehicle type, price ceiling, amenities, covered or open, instant book, distance radius |
| Result list and map, linked | Hovering a card highlights the marker and the reverse |
| Listing detail page | Photos, amenities, jittered map, price table, availability calendar, reviews, host profile summary, cancellation policy |
| Price quote | Full breakdown before any account is required |
| Local SEO pages | One indexable page per neighbourhood and one per landmark, server rendered |
| Legal pages | Terms, privacy policy, cancellation policy, host agreement, contact |
| Host recruitment page | Earnings estimator, onboarding explanation |

### 5.2 Driver surface

| Feature | Notes |
| --- | --- |
| Sign up and sign in | Supabase Auth, email OTP plus password |
| Profile | Name, phone with verification, avatar, notification preferences, language preference |
| Vehicle garage | Multiple vehicles, one default, registration number, make, model, colour, size class |
| Booking flow | Quote, hold, pay, confirm, all inside the `BOOKING_HOLD_MINUTES` window |
| Wallet | Credit balance in paise, ledger of every movement, applied automatically at quote time when opted in |
| Coupons | Code entry at quote, validation against caps and eligibility |
| Referrals | Personal referral code, credit on the referred user's first completed booking |
| Booking list | Upcoming, active, past, cancelled, with filters |
| Booking detail | QR access pass, exact location released from 24 hours before start, gate instructions, host contact through in-app messaging |
| Check-in and check-out | QR scan or manual code, with a `GRACE_PERIOD_MINUTES` allowance |
| Extend a booking | Only if the following interval on the same bay is free |
| Cancellation | Policy-aware refund preview before confirming |
| Reviews | Two-sided, written after completion, published when both sides submit or after the review window closes |
| Disputes | Raise from a completed or active booking, attach evidence |
| Messaging | Scoped to a booking, closed a fixed period after completion |
| Notifications | In-app centre plus email, optional SMS |
| Saved spaces | Favourite a listing for repeat booking |

### 5.3 Host and operator surface

| Feature | Notes |
| --- | --- |
| Host onboarding | Identity document, address proof, ownership or authorisation proof, bank account for payout |
| Verification states | `unverified`, `pending`, `verified`, `rejected`, `suspended` |
| Listing wizard | Multi-step, resumable, saves a draft at every step |
| Photos | Upload, reorder, set cover, minimum count enforced before publish |
| Availability | Weekly recurring schedule, date overrides, blackout dates, seasonal rules |
| Pricing | Hourly, daily, overnight, monthly, event rate, plus a manual dynamic multiplier by day type |
| Capacity and bays | `capacity` greater than 1 creates addressable `bay_index` values |
| Instant book or request | Per-listing setting |
| Cancellation policy | One of `flexible`, `moderate`, `strict`, `non_refundable` per listing |
| Booking inbox | Accept or decline requests within a response window |
| Calendar | Month and week view of all bookings across all listings |
| Earnings | Gross, commission, net, pending, paid, by period and by listing |
| Payouts | Request a withdrawal against the available balance, see settlement history |
| Reliability score | Derived from host cancellations, response time and review scores |
| Staff seats | Operator only, a limited-capability user attached to one or more locations |
| Gate check-in | Operator or staff scans a driver QR at the gate |

### 5.4 Admin and support surface

| Feature | Notes |
| --- | --- |
| Dashboard | North Star Metric, GMV, take rate, supply and demand counters, alerts |
| Host verification queue | Document review, approve, reject with reason, request more information |
| Listing moderation queue | Approve, reject, request changes, unpublish |
| Photo moderation | Flag or remove individual photos |
| Review moderation | Remove a review that breaches policy, always with a recorded reason |
| User management | Search, view, suspend, restore, impersonate in read-only mode with a recorded audit entry |
| Booking management | View any booking, force a state transition with a reason |
| Refund console | Full or partial refund with a reason code |
| Dispute queue | Evidence review, decision, resolution amount, closure |
| Coupon management | Create, cap, schedule, expire |
| Platform settings | Every key in the kernel settings table, editable at runtime |
| Audit log | Immutable, append only, queryable by actor, entity and time |
| Payout console | Approve or hold host withdrawals |

---

## 6. Screen list

Route names are indicative and settle in `12_Information_Architecture.md`.

### Public

| Screen | Route |
| --- | --- |
| Landing | `/` |
| Search results | `/search` |
| Listing detail | `/space/[slug]` |
| Neighbourhood SEO page | `/parking/kolkata/[neighbourhood]` |
| Landmark SEO page | `/parking/near/[landmark]` |
| Become a host | `/host` |
| Legal pages | `/legal/terms`, `/legal/privacy`, `/legal/cancellation`, `/legal/host-agreement` |
| Sign in and sign up | `/auth/sign-in`, `/auth/sign-up`, `/auth/verify` |
| 404 and 500 | system |

### Driver

| Screen | Route |
| --- | --- |
| Quote and checkout | `/book/[spaceId]` |
| Payment | `/book/[bookingId]/pay` |
| Confirmation | `/book/[bookingId]/confirmed` |
| Dashboard | `/account` |
| Bookings list | `/account/bookings` |
| Booking detail and pass | `/account/bookings/[id]` |
| Vehicles | `/account/vehicles` |
| Wallet | `/account/wallet` |
| Referrals | `/account/referrals` |
| Saved spaces | `/account/saved` |
| Messages | `/account/messages` |
| Notifications | `/account/notifications` |
| Profile and settings | `/account/settings` |
| Write a review | `/account/bookings/[id]/review` |
| Raise a dispute | `/account/bookings/[id]/dispute` |

### Host

| Screen | Route |
| --- | --- |
| Host dashboard | `/host/dashboard` |
| Onboarding and verification | `/host/onboarding` |
| Listings list | `/host/listings` |
| Listing wizard | `/host/listings/new`, `/host/listings/[id]/edit` |
| Availability editor | `/host/listings/[id]/availability` |
| Pricing editor | `/host/listings/[id]/pricing` |
| Photos | `/host/listings/[id]/photos` |
| Booking inbox | `/host/bookings` |
| Calendar | `/host/calendar` |
| Earnings | `/host/earnings` |
| Payouts | `/host/payouts` |
| Reviews | `/host/reviews` |
| Staff seats, operator only | `/host/staff` |
| Gate check-in | `/host/scan` |

### Admin

| Screen | Route |
| --- | --- |
| Admin dashboard | `/admin` |
| Verification queue | `/admin/verifications` |
| Listing moderation | `/admin/listings` |
| Users | `/admin/users` |
| Bookings | `/admin/bookings` |
| Refunds | `/admin/refunds` |
| Disputes | `/admin/disputes` |
| Coupons | `/admin/coupons` |
| Payouts | `/admin/payouts` |
| Settings | `/admin/settings` |
| Audit log | `/admin/audit` |

---

## 7. MVP boundary restated

In scope, exactly as the kernel states: auth, vehicles, host onboarding, the listing
wizard, photos, availability, search, map, listing page, quote, booking, hold, payment,
confirmation, QR, check-in and check-out, overstay, cancellation, refund, two-sided
reviews, messaging, notifications, host dashboard, earnings, driver dashboard, wallet,
coupons, referrals, admin panel, moderation, disputes, audit log, analytics, legal pages
and local SEO pages.

Out of scope, exactly as the kernel states: smart locks, licence plate recognition,
occupancy sensors, machine-learned pricing, EV hardware integration, valet, corporate
SaaS billing, white label, multi-country payments and native mobile apps.

---

## 8. Assumptions

| # | Assumption | If false |
| --- | --- | --- |
| A1 | Hosts will accept a 10 percent commission on the taxable amount | Commission is a `platform_settings` key and is changed without a deploy |
| A2 | Drivers will accept a 5 percent service fee plus GST on the fee | Same mechanism, service fee is a settings key |
| A3 | A 10 minute hold is long enough to complete payment and short enough not to starve inventory | `BOOKING_HOLD_MINUTES` is tunable, and hold expiry telemetry tells us which way to move it |
| A4 | A QR code plus a human at the gate is sufficient access control for the MVP | Falls to NG1, hardware becomes a V2 decision |
| A5 | OpenStreetMap coverage of Kolkata is good enough for search and display | We add a commercial tile provider behind the same MapLibre interface |
| A6 | Nominatim's usage policy permits our geocoding volume when proxied and cached | We self-host a Nominatim instance or switch to a paid geocoder behind the same adapter |
| A7 | Jitter of 80 to 150 metres is enough to prevent unauthorised direct access while staying useful for search | Jitter distance is configurable, the deterministic vector is regenerated |
| A8 | A single Supabase project on the free tier is sufficient through the density target | We upgrade the Supabase plan, no architectural change |
| A9 | Most bookings are under 24 hours, so the hold, grace and overstay model holds | Monthly and recurring inventory carries a separate policy branch |
| A10 | Hosts have a bank account that can receive a payout | Payouts are manual bank transfers recorded against the ledger until a payout API is integrated |

---

## 9. Dependencies

| # | Dependency | Type | Risk if unavailable |
| --- | --- | --- | --- |
| D1 | Supabase Postgres, Auth, Storage | Hard | Nothing works. This is the supplied infrastructure. |
| D2 | Postgres `btree_gist` extension | Hard | The exclusion constraint that guarantees no double-booking cannot be created |
| D3 | Vercel hosting | Soft | Any Node host serving Next.js 15 works |
| D4 | OpenStreetMap raster tiles | Soft | Swap the tile URL inside MapLibre |
| D5 | Nominatim geocoding | Soft | Adapter boundary in `lib/geo/geocode.ts` |
| D6 | OSRM public routing | Soft | Fall back to an OpenStreetMap deep link, which is already the designed fallback |
| D7 | Razorpay | Soft for the MVP | The mock provider completes the entire loop. Razorpay is a config change. |
| D8 | Email delivery provider | Medium | Notifications degrade to in-app only |
| D9 | SMS provider for phone verification | Medium | Phone verification becomes optional, trust score drops |
| D10 | A chartered accountant's ruling on GST, TDS and TCS | Hard before real money | Tax logic is isolated in `lib/pricing/tax.ts` and can be replaced |
| D11 | A scheduled job runner for hold expiry, no-show sweeps and payout batches | Hard | Holds never release, inventory starves |

---

## 10. Open questions

Every question has a named owner role and a decision deadline expressed in project weeks.

| # | Question | Owner | Needed by |
| --- | --- | --- | --- |
| OQ1 | Is the platform an aggregator or a pure intermediary for GST purposes, and does section 194-O apply | Finance, with external chartered accountant | Week 8, before any real gateway key is installed |
| OQ2 | Do we invoice on behalf of unregistered hosts, and what does that invoice look like | Finance | Week 8 |
| OQ3 | Is the service fee refunded on a host cancellation only, or also on an admin-forced cancellation | Product | Week 4, before the refund engine is built |
| OQ4 | What is the exact reliability penalty formula for a host cancellation | Product | Week 6 |
| OQ5 | Does an overstay charge go to the driver's saved payment method automatically or become a wallet debt | Product with Legal | Week 7 |
| OQ6 | What is the review publication rule, simultaneous reveal or immediate publication | Product | Week 9 |
| OQ7 | Do operators get their own pricing tier or the same commission as hosts | Business | Week 10 |
| OQ8 | Is phone verification mandatory for drivers, or only for hosts | Trust and Safety | Week 3 |
| OQ9 | What is the retention period for dispute evidence files | Legal | Week 10 |
| OQ10 | Do we allow a driver to book on behalf of another driver, and who holds the QR | Product | Week 7 |
| OQ11 | What happens to an active booking when a host account is suspended mid-stay | Trust and Safety | Week 9 |
| OQ12 | Which neighbourhood gets the first supply push if Park Street underperforms | Growth | Week 6 |

---

## 11. Success criteria

All targets are measured at the end of week 12 unless stated otherwise. The North Star
Metric is **successfully completed parking hours per week**. Every criterion below either
is that metric or feeds it.

### 11.1 North Star and its direct drivers

| # | Criterion | Target |
| --- | --- | --- |
| SC1 | Successfully completed parking hours per week | 1,200 hours in the final week of the pilot |
| SC2 | Completed bookings per week | 400 in the final week |
| SC3 | Median completed booking duration | 3.0 hours or more |
| SC4 | Completion rate, completed divided by confirmed | 92 percent or better |

### 11.2 Supply

| # | Criterion | Target |
| --- | --- | --- |
| SC5 | Live verified spaces inside a 2 km radius of Park Street | 150 |
| SC6 | Live verified spaces across all six launch neighbourhoods | 260 |
| SC7 | Supply utilisation, booked bay-hours divided by available bay-hours | 18 percent or better |
| SC8 | Host 60 day retention, hosts still publishing availability | 70 percent |
| SC9 | Median host time from listing start to published listing | 25 minutes or less |
| SC10 | Median host time from listing published to first confirmed booking | 6 days or less |

### 11.3 Demand and conversion

| # | Criterion | Target |
| --- | --- | --- |
| SC11 | Search to booking conversion, sessions with a search that end in a confirmed booking | 6 percent |
| SC12 | Quote to confirmed conversion | 45 percent |
| SC13 | Hold to paid conversion | 78 percent |
| SC14 | Driver 30 day repeat booking rate | 35 percent |
| SC15 | Median time from search to confirmation | Under 4 minutes |

### 11.4 Trust, correctness and money

| # | Criterion | Target |
| --- | --- | --- |
| SC16 | Overlapping confirmed bookings on the same bay | Exactly zero, checked nightly |
| SC17 | Disputed bookings as a share of completed bookings | Under 1.5 percent |
| SC18 | Median dispute resolution time | Under 48 hours |
| SC19 | Bookings where payment succeeded but the booking did not confirm | Under 0.1 percent, and every one reconciled within 15 minutes |
| SC20 | Ledger imbalance, sum of movements against balances | Exactly zero at every nightly close |
| SC21 | Exposures of exact coordinates outside a confirmed booking window | Exactly zero |
| SC22 | Two-sided review submission rate on completed bookings | 40 percent driver side, 30 percent host side |
| SC23 | Host cancellation rate on confirmed bookings | Under 3 percent |
| SC24 | Driver no-show rate | Under 5 percent |

### 11.5 Commercial

| # | Criterion | Target |
| --- | --- | --- |
| SC25 | Weekly GMV in the final pilot week | Rs 3,20,000 |
| SC26 | Effective take rate, platform revenue divided by GMV | 13 percent or better |
| SC27 | Refunds as a share of GMV | Under 6 percent |
| SC28 | Coupon spend as a share of GMV | Under 8 percent |

---

## 12. Out of band constraints that shape the product

| Constraint | Product consequence |
| --- | --- |
| Money is integer paise in a `bigint` | No price input accepts a float. Every currency field in the UI converts at the boundary only. |
| Location privacy is enforced by Row Level Security | The UI never becomes the place where a leak is prevented. A client bug cannot expose an address. |
| The booking state machine is enforced by a database trigger | An illegal transition is a database error, not a missed `if` statement. |
| Holds participate in the exclusion constraint | Inventory is genuinely locked while a driver pays, and the hold expiry job is on the critical path. |
| Payments run behind a provider abstraction | The entire loop is demonstrable with the mock provider, with no gateway account and no billing card. |

---

## 13. Traceability

Every requirement in `08_Functional_Requirements.md` traces to a feature in section 5 of
this document. Every non-functional target in `09_Non_Functional_Requirements.md` traces
to a success criterion in section 11. Every event in `28_Analytics_Requirements.md` traces
to a funnel step implied by section 5. The 12 week plan in `25_MVP_Roadmap.md` sequences
section 5 into six phases.
