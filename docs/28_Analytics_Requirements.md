# ParkSpace: Analytics Requirements

> Derived from `00_SPEC_KERNEL.md`. Where this document and the kernel disagree, the
> kernel wins. Document number 28.

---

## 1. The North Star Metric

**Successfully completed parking hours per week.**

```
NSM = SUM over bookings b where b.status = 'completed'
      and b.checked_out_at falls inside the ISO week
      of ( b.checked_out_at - b.checked_in_at ) expressed in hours
```

### Why this metric and not another

| Candidate | Why it is not the North Star |
| --- | --- |
| Registered users | Counts intent, not value. A user who never books is worth nothing to either side. |
| Listings created | Counts supply that may be unbookable, unverified or permanently unavailable. |
| Bookings confirmed | Counts a promise, not a delivery. A confirmed booking that ends in `no_show` or `cancelled` delivered nothing. |
| GMV | A real business metric, but it moves with price as well as with usage, so it can rise while the product gets worse. |
| Completed parking hours | Only increases when a driver actually parked, for a real duration, in a space a host actually supplied. Both sides received value. It cannot be inflated by discounting, by vanity signups or by listing spam. |

Two guardrails sit beside it, because a North Star Metric without guardrails invites
gaming:

- **Guardrail A:** driver 30 day repeat booking rate must not fall while NSM rises.
- **Guardrail B:** disputed bookings as a share of completed bookings must stay under 1.5 percent.

### 1.1 The metric tree

```
                 Completed parking hours per week (NSM)
                                 |
        +------------------------+------------------------+
        |                                                 |
  Completed bookings per week                 Median hours per booking
        |                                                 |
   +----+---------+                         +-------------+------------+
   |              |                         |                          |
Confirmed     Completion rate          Inventory mix            Extension rate
bookings      (completed /            (hourly, daily,
per week      confirmed)               overnight, monthly)
   |
   +-------------------+-------------------+
   |                   |                   |
Sessions with     Search to book      Bookable supply
a search          conversion          density
   |                   |                   |
   |          +--------+--------+          +-------------+
   |          |                 |                        |
Acquisition  Quote to      Hold to paid          Live spaces per
and repeat   confirmed     conversion            neighbourhood
             conversion                                  |
                                              +----------+----------+
                                              |                     |
                                        Hosts activated      Availability
                                                             hours published
```

Every branch is a lever. If NSM is flat, the tree tells you which branch to investigate:
not enough sessions, not enough conversion, not enough supply, or bookings that are too
short.

---

## 2. Event taxonomy

### 2.1 Conventions

| Rule | Detail |
| --- | --- |
| Naming | `object_action`, lower snake case, past tense verb. `search_performed`, not `performSearch`. |
| Immutability | An event name is never repurposed. A changed meaning requires a new name with a version suffix. |
| Identity | Every event carries `anonymous_id`, and `user_id` where a session exists. The two are stitched at sign in. |
| Money | Every monetary property is an integer number of paise, named with an `_paise` suffix. Never a float, never rupees. |
| Time | Every timestamp is ISO 8601 with an explicit offset. Durations are integers in the unit named in the property. |
| Server first | Every event that represents a state change is emitted server side. Client events are for interaction only, never for revenue or booking state. |
| Common properties | `event_id`, `occurred_at`, `anonymous_id`, `user_id`, `session_id`, `role`, `platform`, `app_version`, `city`, `neighbourhood` are attached to every event and are not repeated in the tables below. |

### 2.2 Discovery events

| Event | Emitted | Properties |
| --- | --- | --- |
| `landing_viewed` | Client | `referrer: string`, `campaign: string \| null` |
| `search_performed` | Server | `query_text: string \| null`, `centre_lat: float`, `centre_lng: float`, `radius_m: int`, `starts_at: timestamptz`, `ends_at: timestamptz`, `duration_minutes: int`, `filters: object`, `result_count: int`, `server_ms: int`, `source: 'text' \| 'viewport' \| 'seo_page' \| 'saved'` |
| `search_zero_results` | Server | `query_text: string \| null`, `radius_m: int`, `duration_minutes: int`, `nearest_alternative_distance_m: int \| null` |
| `search_filter_applied` | Client | `filter_name: string`, `filter_value: string`, `result_count_after: int` |
| `map_viewport_changed` | Client | `zoom: float`, `bbox: object`, `marker_count: int`, `triggered_search: bool` |
| `map_marker_clicked` | Client | `space_id: uuid`, `position_in_results: int` |
| `space_viewed` | Server | `space_id: uuid`, `host_id: uuid`, `position_in_results: int \| null`, `source: 'search' \| 'map' \| 'seo' \| 'direct' \| 'saved' \| 'rebook'`, `price_hourly_paise: bigint`, `capacity: int`, `rating_avg: float \| null` |
| `space_photos_browsed` | Client | `space_id: uuid`, `photos_viewed: int` |
| `space_saved` | Server | `space_id: uuid` |
| `seo_page_viewed` | Server | `page_type: 'neighbourhood' \| 'landmark'`, `slug: string`, `listing_count: int` |

### 2.3 Quote and booking events

| Event | Emitted | Properties |
| --- | --- | --- |
| `quote_requested` | Server | `space_id: uuid`, `starts_at: timestamptz`, `ends_at: timestamptz`, `duration_minutes: int`, `base_amount_paise: bigint`, `discount_amount_paise: bigint`, `taxable_amount_paise: bigint`, `service_fee_paise: bigint`, `tax_amount_paise: bigint`, `total_amount_paise: bigint`, `dynamic_multiplier: float`, `coupon_code: string \| null`, `wallet_applied_paise: bigint` |
| `quote_failed` | Server | `space_id: uuid`, `reason: 'DURATION_BELOW_MINIMUM' \| 'DURATION_ABOVE_MAXIMUM' \| 'VEHICLE_NOT_PERMITTED' \| 'NO_AVAILABILITY'` |
| `booking_started` | Server | `booking_id: uuid`, `space_id: uuid`, `bay_index: int`, `hold_expires_at: timestamptz`, `total_amount_paise: bigint`, `instant_book: bool` |
| `hold_expired` | Server | `booking_id: uuid`, `space_id: uuid`, `seconds_held: int`, `reached_payment: bool` |
| `booking_abandoned` | Server | `booking_id: uuid`, `last_step: 'vehicle' \| 'review' \| 'payment'`, `seconds_in_flow: int` |
| `booking_conflict` | Server | `space_id: uuid`, `starts_at: timestamptz`, `ends_at: timestamptz`, `reason: 'SPACE_NO_LONGER_AVAILABLE'`, `alternatives_offered: int` |
| `booking_request_sent` | Server | `booking_id: uuid`, `host_id: uuid`, `response_deadline: timestamptz` |
| `booking_request_answered` | Server | `booking_id: uuid`, `outcome: 'accepted' \| 'declined' \| 'expired'`, `response_seconds: int`, `decline_reason: string \| null` |
| `booking_confirmed` | Server | `booking_id: uuid`, `space_id: uuid`, `host_id: uuid`, `bay_index: int`, `duration_minutes: int`, `total_amount_paise: bigint`, `host_payout_paise: bigint`, `platform_revenue_paise: bigint`, `cancellation_policy: 'flexible' \| 'moderate' \| 'strict' \| 'non_refundable'`, `lead_time_minutes: int`, `is_first_booking: bool` |
| `booking_extended` | Server | `booking_id: uuid`, `added_minutes: int`, `added_amount_paise: bigint` |
| `booking_extension_blocked` | Server | `booking_id: uuid`, `requested_minutes: int`, `max_available_minutes: int` |

### 2.4 Payment events

| Event | Emitted | Properties |
| --- | --- | --- |
| `payment_initiated` | Server | `booking_id: uuid`, `provider: 'mock' \| 'razorpay'`, `amount_paise: bigint`, `idempotency_key: string`, `attempt_number: int` |
| `payment_succeeded` | Server | `booking_id: uuid`, `provider: string`, `amount_paise: bigint`, `wallet_portion_paise: bigint`, `gateway_portion_paise: bigint`, `latency_ms: int` |
| `payment_failed` | Server | `booking_id: uuid`, `provider: string`, `failure_code: string`, `attempt_number: int`, `hold_seconds_remaining: int` |
| `webhook_received` | Server | `provider: string`, `event_type: string`, `provider_event_id: string`, `is_duplicate: bool`, `delay_seconds: int` |
| `webhook_orphaned` | Server | `provider_event_id: string`, `booking_status_at_arrival: string`, `action_taken: 'auto_refund' \| 'confirmed' \| 'flagged'` |
| `refund_issued` | Server | `booking_id: uuid`, `amount_paise: bigint`, `reason: 'driver_cancel' \| 'host_cancel' \| 'dispute' \| 'orphan_payment' \| 'admin_goodwill'`, `policy_applied: string`, `service_fee_retained: bool` |
| `reconciliation_mismatch` | Server | `provider_reference: string`, `mismatch_type: string`, `age_seconds: int` |

### 2.5 Fulfilment events

| Event | Emitted | Properties |
| --- | --- | --- |
| `access_pass_viewed` | Client | `booking_id: uuid`, `minutes_before_start: int`, `address_released: bool` |
| `checkin_completed` | Server | `booking_id: uuid`, `space_id: uuid`, `method: 'qr' \| 'manual'`, `minutes_from_scheduled_start: int`, `scanned_by_role: 'driver' \| 'host' \| 'operator' \| 'staff'` |
| `checkin_failed` | Server | `booking_id: uuid`, `reason: 'CHECKIN_TOO_EARLY' \| 'CHECKIN_TOO_LATE' \| 'INVALID_TOKEN' \| 'WRONG_BOOKING'` |
| `checkout_completed` | Server | `booking_id: uuid`, `actual_minutes: int`, `booked_minutes: int`, `variance_minutes: int` |
| `booking_completed` | Server | `booking_id: uuid`, `space_id: uuid`, `host_id: uuid`, `parking_hours: float`, `host_payout_paise: bigint`, `platform_revenue_paise: bigint` |
| `no_show_recorded` | Server | `booking_id: uuid`, `space_id: uuid`, `grace_minutes: int`, `amount_retained_paise: bigint` |
| `overstay_detected` | Server | `booking_id: uuid`, `overstay_minutes: int`, `charge_paise: bigint`, `increments: int` |
| `booking_cancelled` | Server | `booking_id: uuid`, `cancelled_by: 'driver' \| 'host' \| 'admin' \| 'system'`, `hours_before_start: float`, `policy: string`, `refund_paise: bigint`, `reason_code: string \| null` |

### 2.6 Supply events

| Event | Emitted | Properties |
| --- | --- | --- |
| `host_onboarding_started` | Server | `from_role: 'driver' \| 'new'` |
| `host_document_uploaded` | Server | `document_type: 'identity' \| 'address' \| 'ownership'` |
| `host_verification_submitted` | Server | `minutes_from_start: int` |
| `host_verification_decided` | Server | `outcome: 'verified' \| 'rejected'`, `reason_code: string \| null`, `queue_hours: float` |
| `listing_wizard_step_completed` | Server | `space_id: uuid`, `step: int`, `step_name: string`, `seconds_on_step: int` |
| `listing_wizard_abandoned` | Server | `space_id: uuid`, `last_step: int`, `seconds_in_wizard: int` |
| `listing_published` | Server | `space_id: uuid`, `neighbourhood: string`, `capacity: int`, `price_hourly_paise: bigint`, `cancellation_policy: string`, `photo_count: int`, `weekly_available_hours: float`, `minutes_from_wizard_start: int` |
| `listing_moderation_decided` | Server | `space_id: uuid`, `outcome: 'approved' \| 'rejected' \| 'changes_requested'`, `queue_hours: float` |
| `listing_unpublished` | Server | `space_id: uuid`, `reason: 'host' \| 'moderation' \| 'suspension'`, `future_bookings_affected: int` |
| `availability_updated` | Server | `space_id: uuid`, `weekly_hours_before: float`, `weekly_hours_after: float` |
| `host_first_booking_received` | Server | `space_id: uuid`, `days_since_published: float` |
| `payout_requested` | Server | `host_id: uuid`, `amount_paise: bigint` |

### 2.7 Trust, engagement and growth events

| Event | Emitted | Properties |
| --- | --- | --- |
| `review_submitted` | Server | `booking_id: uuid`, `direction: 'driver_to_space' \| 'host_to_driver'`, `rating: int`, `has_text: bool`, `days_after_completion: float` |
| `review_published` | Server | `booking_id: uuid`, `trigger: 'both_submitted' \| 'window_closed'` |
| `message_sent` | Server | `booking_id: uuid`, `sender_role: 'driver' \| 'host' \| 'staff'`, `redacted: bool` |
| `dispute_raised` | Server | `booking_id: uuid`, `raised_by: 'driver' \| 'host'`, `category: string`, `evidence_count: int` |
| `dispute_resolved` | Server | `booking_id: uuid`, `outcome: string`, `resolution_amount_paise: bigint`, `hours_to_resolve: float` |
| `notification_sent` | Server | `notification_type: string`, `channel: 'in_app' \| 'email' \| 'sms'` |
| `notification_opened` | Server | `notification_type: string`, `channel: string`, `minutes_to_open: float` |
| `coupon_applied` | Server | `coupon_code: string`, `discount_paise: bigint`, `capped: bool` |
| `coupon_rejected` | Server | `coupon_code: string`, `reason: 'EXPIRED' \| 'EXHAUSTED' \| 'ALREADY_USED' \| 'NOT_ELIGIBLE'` |
| `wallet_credited` | Server | `amount_paise: bigint`, `source: 'refund' \| 'referral' \| 'goodwill' \| 'promotion'` |
| `wallet_debited` | Server | `amount_paise: bigint`, `booking_id: uuid` |
| `referral_attributed` | Server | `referrer_id: uuid` |
| `referral_credited` | Server | `referrer_id: uuid`, `credit_paise: bigint`, `days_to_conversion: float` |
| `signup_completed` | Server | `method: 'otp' \| 'password'`, `referral_code: string \| null` |
| `role_added` | Server | `new_role: 'host' \| 'operator'` |

---

## 3. Funnel definitions

Every funnel is measured per session unless stated otherwise, over a rolling 7 day window,
and is segmented by neighbourhood, device class and new against returning.

### 3.1 Primary acquisition funnel, driver

| Step | Event | Target conversion from previous step |
| --- | --- | --- |
| 1 | `search_performed` | Entry |
| 2 | `space_viewed` | 55 percent |
| 3 | `quote_requested` | 40 percent |
| 4 | `booking_started` | 55 percent |
| 5 | `payment_succeeded` | 78 percent |
| 6 | `booking_confirmed` | 99 percent |
| 7 | `checkin_completed` | 93 percent |
| 8 | `booking_completed` | 99 percent |

End to end search to completed target: 5.5 percent of searching sessions.

### 3.2 Checkout micro-funnel

Measured per `booking_started`, because this is where the hold clock runs and every second
costs inventory.

| Step | Event | Notes |
| --- | --- | --- |
| 1 | `booking_started` | Hold taken, interval locked |
| 2 | `payment_initiated` | Target within 90 seconds of step 1 |
| 3 | `payment_succeeded` or `payment_failed` | Failure keeps the hold alive for its remainder |
| 4 | `booking_confirmed` or `hold_expired` | `hold_expired` with `reached_payment = true` is the alarm signal |

### 3.3 Host activation funnel

Measured per host, not per session, over a 30 day window from `host_onboarding_started`.

| Step | Event | Target |
| --- | --- | --- |
| 1 | `host_onboarding_started` | Entry |
| 2 | `host_verification_submitted` | 70 percent |
| 3 | `host_verification_decided` with outcome `verified` | 85 percent |
| 4 | `listing_published` | 80 percent |
| 5 | `host_first_booking_received` | 75 percent within 6 days |
| 6 | `payout_requested` | 60 percent within 30 days |

### 3.4 Repeat funnel

| Step | Definition |
| --- | --- |
| 1 | `booking_completed` where `is_first_booking = true` |
| 2 | `search_performed` within 30 days of step 1 |
| 3 | Second `booking_confirmed` within 30 days |

Target: 35 percent of first-time completers book again within 30 days.

---

## 4. Marketplace health metrics

| Metric | Definition | Target at week 12 | Cadence |
| --- | --- | --- | --- |
| North Star, completed parking hours | Sum of completed booking durations in hours per ISO week | 1,200 hours | Weekly |
| GMV | Sum of `total_amount_paise` on confirmed bookings, less refunds | Rs 3,20,000 per week | Weekly |
| Net revenue | Sum of `platform_revenue_paise`, which is `service_fee + host_commission` | Rs 41,600 per week | Weekly |
| Take rate | Net revenue divided by GMV | 13 percent or better | Weekly |
| Supply utilisation | Booked bay-hours divided by published available bay-hours | 18 percent | Weekly, by neighbourhood |
| Density | Live verified spaces inside a 2 km radius of each launch centre | 150 at Park Street | Weekly, by neighbourhood |
| Search to book conversion | Sessions with a `search_performed` that reach `booking_confirmed`, divided by sessions with a `search_performed` | 6 percent | Daily |
| Quote to confirmed | `booking_confirmed` divided by distinct `quote_requested` | 45 percent | Daily |
| Hold to paid | `payment_succeeded` divided by `booking_started` | 78 percent | Daily |
| Completion rate | `booking_completed` divided by `booking_confirmed` | 92 percent | Weekly |
| Driver repeat rate | Share of first-time completers with a second confirmed booking within 30 days | 35 percent | Weekly cohort |
| Host retention | Hosts with published availability 60 days after `listing_published` | 70 percent | Monthly cohort |
| Host earnings per active listing | `host_payout_paise` per published listing per week | Rs 1,100 | Weekly |
| Liquidity | Share of searches returning 3 or more results for the requested interval | 80 percent | Daily, by neighbourhood |
| Zero result rate | `search_zero_results` divided by `search_performed` | Under 12 percent | Daily |
| Conflict rate | `booking_conflict` divided by `booking_started` attempts | Under 2 percent | Daily |
| No-show rate | `no_show_recorded` divided by `booking_confirmed` | Under 5 percent | Weekly |
| Host cancellation rate | `booking_cancelled` with `cancelled_by = 'host'` divided by `booking_confirmed` | Under 3 percent | Weekly |
| Dispute rate | `dispute_raised` divided by `booking_completed` | Under 1.5 percent | Weekly |
| Refund ratio | Refunded paise divided by GMV | Under 6 percent | Weekly |
| Coupon spend ratio | Coupon discount paise divided by GMV | Under 8 percent | Weekly |
| Review rate | `review_submitted` divided by `booking_completed`, by direction | 40 percent driver, 30 percent host | Weekly |
| Orphan payment count | `webhook_orphaned` per week | Zero unresolved beyond 15 minutes | Daily |

### 4.1 Density is measured, not assumed

Density is reported per neighbourhood, never as a national or city average, because the
kernel states that success is supply density inside a neighbourhood. The report carries six
rows, one per launch neighbourhood, each with live spaces, published available bay-hours,
booked bay-hours, utilisation, liquidity and zero result rate. A city-level average of
these figures is explicitly forbidden in any dashboard, because it hides exactly the
failure mode the metric exists to detect.

---

## 5. Cohort definitions

| Cohort | Grouping key | Tracked over | Primary question |
| --- | --- | --- | --- |
| Driver signup cohort | ISO week of `signup_completed` | 12 weeks | What share ever completes a first booking, and how fast |
| Driver activation cohort | ISO week of first `booking_completed` | 12 weeks | Repeat rate at 7, 30 and 90 days, and parking hours per driver per week |
| Host signup cohort | ISO week of `host_onboarding_started` | 12 weeks | What share reaches `listing_published`, and time to first booking |
| Host activation cohort | ISO week of first `host_first_booking_received` | 24 weeks | Retention of published availability, earnings per week, cancellation behaviour |
| Listing cohort | ISO week of `listing_published` | 12 weeks | Utilisation curve by week since publication, time to first booking |
| Neighbourhood cohort | Launch neighbourhood | Continuous | Density, liquidity and utilisation trajectory, compared against Park Street as the reference |
| Acquisition channel cohort | `campaign` on first `landing_viewed` | 12 weeks | Cost per completed parking hour, not cost per signup |
| Policy cohort | `cancellation_policy` on first booking | 12 weeks | Does a stricter policy raise completion rate or suppress conversion |

---

## 6. Dashboards by role

### 6.1 Executive dashboard, weekly

| Panel | Content |
| --- | --- |
| North Star | Completed parking hours per week, 12 week trend, with both guardrails plotted alongside |
| Commercial | GMV, net revenue, take rate, refund ratio, coupon spend ratio |
| Marketplace balance | Density, liquidity and utilisation, one row per launch neighbourhood, never averaged |
| Funnel | Search to completed, with each step's conversion against target |
| Cohorts | Driver repeat curve and host retention curve, latest 8 cohorts |

### 6.2 Growth dashboard, daily

| Panel | Content |
| --- | --- |
| Acquisition | Sessions, searches, signups, by channel and by SEO page |
| Conversion | Search to book, quote to confirmed, hold to paid, split by new and returning |
| Demand gaps | Zero result rate and conflict rate by neighbourhood, by hour of day, by day of week |
| Supply gaps | The top 20 search centres with high volume and low liquidity, ranked. This is the supply recruitment list. |
| Promotions | Coupon redemption, referral attribution and referral credits, against caps |

### 6.3 Host-facing dashboard, in product

| Panel | Content |
| --- | --- |
| Earnings | Gross, commission, net, pending against available, this week and last |
| Occupancy | Booked hours against published hours, per listing |
| Demand signal | Searches in this neighbourhood that this listing did not match, and why: price, availability or vehicle size |
| Reliability | Response time, cancellation count, rating average, with plain-language explanation |

### 6.4 Operator dashboard

| Panel | Content |
| --- | --- |
| Per location | Arrivals, departures, current occupancy, bay-level view |
| Staff | Check-ins performed per staff seat, manual code usage rate |
| Yield | Utilisation by hour of day and day of week, per location |
| Exceptions | Overstays, no-shows, failed check-ins, in the last 24 hours |

### 6.5 Trust and safety dashboard

| Panel | Content |
| --- | --- |
| Queues | Verification, moderation and dispute queue depth and age, with the oldest item surfaced |
| Outcomes | Dispute categories, resolution times, resolution amounts |
| Signals | Host cancellation rate, no-show rate, review rating distribution, reported content volume |
| Enforcement | Suspensions, listing removals, review removals, each with its reason distribution |

### 6.6 Engineering and reliability dashboard

| Panel | Content |
| --- | --- |
| Correctness | Overlapping booking count, which must be zero, and ledger imbalance, which must be zero |
| Money integrity | Orphan payments, reconciliation mismatches, refund idempotency violations |
| Jobs | Hold expiry, no-show sweep, overstay sweep, reconciliation, payout batch, each with last success time |
| Latency | p50, p95 and p99 for search, quote, hold, payment and check-in, against the budgets in `09_Non_Functional_Requirements.md` |
| Errors | Error rate by route class, webhook failure rate, authentication failure rate |

---

## 7. Instrumentation requirements

| ID | Requirement | Priority |
| --- | --- | --- |
| AR-001 | Every state-changing event is emitted server side, inside or immediately after the transaction that caused it, so that analytics cannot disagree with the database | MUST |
| AR-002 | Every event carries a unique `event_id`, and the pipeline deduplicates on it, so that a retried job produces one analytics record | MUST |
| AR-003 | `anonymous_id` is stitched to `user_id` at sign in, retroactively linking pre-signup events to the account | MUST |
| AR-004 | Event schemas are validated at the emission boundary, and an event failing validation is rejected loudly rather than silently dropped | MUST |
| AR-005 | The North Star Metric is computable directly from the `bookings` table alone, with no dependence on the event pipeline, so that a pipeline outage cannot lose it | MUST |
| AR-006 | Every dashboard figure names its source query, and every query is version controlled alongside the application | SHOULD |
| AR-007 | Analytics queries run against a read path that cannot affect booking transaction latency | SHOULD |
| AR-008 | Admin-forced state transitions are excluded from organic conversion metrics and reported separately | MUST |
| AR-009 | Test and seed accounts are flagged and excluded from every product metric by default | MUST |
| AR-010 | Raw events are retained for 13 months, and aggregates indefinitely | SHOULD |

---

## 8. Privacy note: what must never be logged

The analytics pipeline is a place where privacy rules are quietly broken by accident, so
the prohibitions are stated as hard rules. Anything in this list appearing in an event
payload, a log line, a dashboard or an export is a defect of the same severity as a
security bug.

| Never logged | Why |
| --- | --- |
| `exact_lat` and `exact_lng` of any space | The kernel location privacy rule. Analytics uses `approx_lat` and `approx_lng`, or the neighbourhood identifier, which is sufficient for every metric in this document. |
| Full street address, gate number, access instructions | Same rule. The neighbourhood is the analytical unit, not the address. |
| Payment card numbers, CVV, UPI handles, bank account numbers, IFSC codes | Never touched by the application in the first place, and never acceptable in an event |
| One time passcodes and authentication tokens | A logged credential is a live credential |
| QR access pass token payloads | Possession of the token is possession of access |
| Message bodies | Only `message_sent` with metadata is emitted. Content stays in the database under Row Level Security. |
| Review free text | Only the rating and a `has_text` boolean. Text is a product surface, not an analytics property. |
| Verification document contents, file names or derived identifiers | Identity documents leave the private bucket for nobody |
| Dispute evidence files or their descriptions | Same |
| Vehicle registration numbers | Personal and uniquely identifying. Vehicle `size_class` is the only property analytics needs. |
| Precise device fingerprints, advertising identifiers, raw IP addresses | Not needed for any metric here. Coarse `platform` and `city` are sufficient. |
| Email addresses and phone numbers in any event property | `user_id` is the join key. Contact details never enter the pipeline. |

### 8.1 Supporting rules

| ID | Rule | Priority |
| --- | --- | --- |
| AR-P01 | An automated test asserts that no event payload contains a key matching a denylist of forbidden field names, and it fails the build on a match | MUST |
| AR-P02 | Any user identifier appearing in an export intended to leave the platform is pseudonymised | MUST |
| AR-P03 | A user exercising deletion has their events pseudonymised, with aggregate history preserved and personal linkage severed | MUST |
| AR-P04 | Dashboards accessible to hosts and operators show only data about their own listings, bookings and locations, enforced by the same Row Level Security policies as the product | MUST |
| AR-P05 | No analytics event is sent to a third party processor that is not named in the privacy policy | MUST |
