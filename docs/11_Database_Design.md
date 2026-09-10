# 11. Database Design

> Every table, column, index, trigger and constraint described here exists in
> `supabase/migrations/0001` through `0009`. Nothing in this document is
> planned. Where a table exists but nothing writes to it yet, that is stated.

## 1. Shape of the schema

Nine migrations, applied in filename order by `scripts/db-push.mjs` and tracked
in a `_parkspace_migrations` table so re-running is safe.

| File | Contents |
| --- | --- |
| `0001_extensions_and_enums.sql` | Three extensions, 17 enums, five helper functions |
| `0002_identity.sql` | `profiles`, `vehicles`, `host_profiles`, `verification_documents` |
| `0003_inventory.sql` | `parking_spaces`, `space_photos`, `availability_rules`, `availability_blocks`, `price_overrides` |
| `0004_bookings.sql` | `bookings`, `booking_events`, the exclusion constraint, the state machine trigger |
| `0005_money_trust_comms.sql` | 16 tables covering payments, refunds, payouts, reviews, messages, disputes, coupons, wallet, referrals, notifications, audit, settings, search events |
| `0006_availability_and_search.sql` | `is_space_available`, `price_quote_paise`, `search_spaces`, `space_availability_calendar` and their components |
| `0007_booking_operations.sql` | The transactional RPCs and the sweepers |
| `0008_rls_policies.sql` | RLS on 26 tables, the two public views, the column grants, the function grants |
| `0009_refund_split.sql` | Replaces `compute_refund_paise` and `cancel_booking` with versions that return and record the forfeit split |

`supabase/seed/seed.sql` additionally creates `seo_localities`, a reference table
for the local SEO routes, with eight Kolkata neighbourhoods and three demo
coupons. It is idempotent.

## 2. Extensions

| Extension | Why it is required |
| --- | --- |
| `btree_gist` | The one that matters. A GiST index natively understands range overlap (`&&`) but not scalar equality on `space_id` or `bay_index`. `btree_gist` teaches GiST the scalar operators, which is what makes the composite exclusion constraint in section 8 expressible at all. Without it, migration 0004 fails. |
| `pgcrypto` | `gen_random_uuid()` for primary keys and `gen_random_bytes(24)` for QR tokens. |
| `pg_trgm` | Backs `spaces_title_trgm_idx`, a GIN trigram index for fuzzy title matching. |

PostGIS is deliberately not used. `earth_distance_m()` implements haversine in
pure SQL, `immutable parallel safe`, so the schema runs on any plain Postgres
including a local container, with no extension negotiation.

## 3. Enums

Seventeen enums make invalid states unrepresentable rather than merely
discouraged.

| Enum | Values |
| --- | --- |
| `user_role` | `driver`, `host`, `operator`, `admin`, `support` |
| `verification_status` | `unverified`, `pending`, `in_review`, `verified`, `rejected`, `suspended` |
| `space_type` | `driveway`, `garage`, `covered_lot`, `open_lot`, `basement`, `stack_parking`, `street_side`, `multi_level` |
| `vehicle_type` | `two_wheeler`, `hatchback`, `sedan`, `suv`, `electric`, `commercial` |
| `listing_status` | `draft`, `pending_review`, `active`, `paused`, `rejected`, `delisted` |
| `booking_status` | `draft`, `pending`, `confirmed`, `active`, `completed`, `cancelled`, `expired`, `no_show`, `disputed` |
| `cancellation_policy` | `flexible`, `moderate`, `strict`, `non_refundable` |
| `cancelled_by_party` | `driver`, `host`, `platform`, `system` |
| `payment_status` | `created`, `authorized`, `captured`, `failed`, `refunded`, `partially_refunded` |
| `refund_status` | `requested`, `processing`, `completed`, `rejected`, `failed` |
| `payout_status` | `scheduled`, `processing`, `paid`, `failed`, `on_hold` |
| `review_direction` | `driver_to_host`, `host_to_driver` |
| `dispute_category` | 12 values from `space_unavailable` to `other` |
| `dispute_status` | `open`, `investigating`, `awaiting_user`, `resolved_driver`, `resolved_host`, `resolved_split`, `rejected`, `withdrawn` |
| `notification_channel` | `in_app`, `push`, `email`, `sms`, `whatsapp` |
| `wallet_txn_type` | `refund_credit`, `referral_credit`, `promo_credit`, `compensation`, `booking_spend`, `withdrawal`, `adjustment` |
| `coupon_type` | `flat` (paise), `percent` (basis points) |
| `access_method` | `open_access`, `host_greets`, `qr_code`, `pin_code`, `remote_gate`, `smart_lock`, `plate_recognition` |

## 4. Entity relationship diagram

```
                          auth.users  (Supabase Auth)
                                │  on insert → handle_new_auth_user()
                                ▼
  ┌─────────────────────────────────────────────────────────────────────┐
  │ profiles  (id = auth.users.id)                                      │
  │  role, roles[], verification, trust_score, wallet_balance_paise,    │
  │  referral_code, referred_by → profiles.id                           │
  └──┬───────────┬────────────┬─────────────┬──────────────┬────────────┘
     │ 1:N       │ 1:1        │ 1:N         │ 1:N          │ 1:N
     ▼           ▼            ▼             ▼              ▼
 ┌─────────┐ ┌─────────────┐ ┌────────────────────┐ ┌──────────────────┐
 │vehicles │ │host_profiles│ │verification_       │ │wallet_           │
 │ owner_id│ │ user_id PK  │ │  documents         │ │  transactions    │
 └────┬────┘ └──────┬──────┘ └────────────────────┘ └──────────────────┘
      │             │ host_id
      │             ▼
      │   ┌──────────────────────────────────────────────────┐
      │   │ parking_spaces                                   │
      │   │  lat/lng (true)  approx_lat/approx_lng (jittered)│
      │   │  capacity, prices, status, search_vector, slug   │
      │   └──┬──────────┬─────────────┬───────────┬──────────┘
      │      │ 1:N      │ 1:N         │ 1:N       │ 1:N
      │      ▼          ▼             ▼           ▼
      │  ┌────────┐ ┌───────────┐ ┌──────────┐ ┌───────────────┐
      │  │space_  │ │availabil. │ │availabil.│ │price_overrides│
      │  │photos  │ │_rules     │ │_blocks   │ │  multiplier_bp│
      │  └────────┘ └───────────┘ └──────────┘ └───────────────┘
      │                  │ space_id
      │   ┌──────────────▼───────────────────────────────────────┐
      └──►│ bookings                                             │
          │  space_id, driver_id, host_id, vehicle_id, bay_index │
          │  period tstzrange GENERATED, status, money in paise  │
          │  ═══ EXCLUDE (space_id =, bay_index =, period &&) ═══│
          └──┬────┬────┬────┬────┬───────┬──────────┬────────────┘
             │    │    │    │    │       │          │
             ▼    ▼    ▼    ▼    ▼       ▼          ▼
      ┌──────────┐ ┌──────┐ ┌────────┐ ┌────────┐ ┌───────────────┐
      │booking_  │ │pay-  │ │reviews │ │messages│ │disputes       │
      │  events  │ │ments │ │(2 way) │ │        │ │  → refund_id  │
      └──────────┘ └──┬───┘ └────────┘ └────────┘ └───────────────┘
                      │ 1:N                    ┌──────────────────┐
                      ▼                        │coupon_redemptions│
                  ┌────────┐  ┌───────────┐    │ coupon_id ───────┼──► coupons
                  │refunds │  │payout_    │    └──────────────────┘
                  └────────┘  │  items    │───► payouts ──► profiles(host_id)
                              └───────────┘

  Standalone:  webhook_events   audit_logs   platform_settings
               notifications    referrals    search_events   seo_localities

  Views:       public_spaces  (security_invoker = false)
               public_profiles (security_invoker = false)
```

## 5. Identity tables

### profiles

One row per `auth.users` row, created automatically so no code path can produce
an authenticated user without a profile.

| Column | Type | Purpose |
| --- | --- | --- |
| `id` | `uuid` PK → `auth.users(id)` cascade | Same id as the auth user, which is what makes `id = auth.uid()` work in every policy |
| `full_name`, `email`, `avatar_url` | `text` | Display identity |
| `phone` | `text` unique | Checked against `^\+?[0-9]{10,15}$` |
| `phone_verified_at` | `timestamptz` | Null until verified |
| `role` | `user_role` not null default `driver` | The active role |
| `roles` | `user_role[]` not null default `{driver}` | Every granted role. `profiles_role_in_roles` checks `role = any(roles)` |
| `verification` | `verification_status` | Identity verification state |
| `trust_score` | `smallint` 0..100 default 50 | Derived, maintained by `recompute_trust_score()`. Stored because it participates in ranking |
| `bookings_completed`, `bookings_cancelled` | `integer` | Denormalised counters, trigger-maintained |
| `wallet_balance_paise` | `bigint` >= 0 | Cache of the `wallet_transactions` sum |
| `referral_code` | `text` unique | Eight uppercase hex characters, generated in a collision-checked loop |
| `referred_by` | `uuid` → `profiles(id)` set null | Who invited this person |
| `preferred_locale`, `timezone` | `text` | Defaults `en-IN` and `Asia/Kolkata` |
| `notification_prefs` | `jsonb` | Per-channel opt-in, defaults marketing false |
| `is_suspended`, `suspended_reason`, `suspended_at` | `boolean`, `text`, `timestamptz` | Moderation hold |
| `last_seen_at`, `created_at`, `updated_at` | `timestamptz` | |

### vehicles

| Column | Type | Purpose |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `owner_id` | `uuid` → `profiles` cascade | |
| `registration_number` | `text` | Normalised uppercase alphanumeric by trigger; checked `^[A-Z0-9]{4,15}$` |
| `vehicle_type` | `vehicle_type` | Matched against `parking_spaces.vehicle_types` at booking time |
| `make`, `model`, `colour` | `text` | How a guard identifies the car at the gate |
| `length_mm`, `width_mm`, `height_mm` | `integer`, bounded | Optional. When present, the booking engine rejects a vehicle that will not fit |
| `is_electric`, `is_default` | `boolean` | |

Vehicle data is not decoration: it is how a booking is matched to a car, how a
host knows the SUV will fit, and how a dispute about the wrong vehicle is
settled.

### host_profiles

Keyed by `user_id` as the primary key, so a profile has at most one host profile.
Holds `display_name`, `bio`, business fields, KYC state and reviewer, reliability
signals (`response_rate_bp`, `acceptance_rate_bp`, `cancellation_count_90d`,
`avg_response_minutes`), the Superhost flag, and two money caches:
`total_earnings_paise` and `payable_balance_paise`.

`payout_ref` and `payout_ref_provider` hold an opaque reference issued by the
payment provider. Raw bank details never enter this database.

### verification_documents

Stores `storage_path` and metadata only. Never a document image, never an
extracted identity number. Carries `expires_at` because documents are evidence
with a shelf life. A table comment states the rule so it cannot be lost.

## 6. Inventory tables

### parking_spaces

The largest table. Grouped by purpose:

| Group | Columns |
| --- | --- |
| Identity | `id`, `host_id`, `title` (8..120 chars), `description` (<= 4000), `slug` unique |
| Address, public | `locality`, `city`, `state`, `postal_code`, `country` |
| Address, protected | `address_line`, `landmark` |
| Coordinates | `lat`, `lng` (true, bounded), `approx_lat`, `approx_lng` (jittered, public) |
| Physical | `space_type`, `vehicle_types[]`, `capacity` (1..500), `max_length_mm`, `max_width_mm`, `max_height_mm` |
| Descriptive | `amenities[]`, `rules[]` |
| Pricing | `price_hourly_paise`, `price_daily_paise`, `price_monthly_paise`, `currency` |
| Duration rules | `min_booking_minutes` (>= 15), `max_booking_minutes`, `min_notice_minutes`, `max_advance_days` (1..365) |
| Commercial | `instant_book`, `cancellation_policy` |
| Access | `access_method`, `access_instructions`, `access_pin` |
| EV | `has_ev_charging`, `ev_connector_type`, `ev_power_kw`, `ev_price_per_kwh_paise` |
| Moderation | `status`, `rejection_reason`, `reviewed_by`, `reviewed_at`, `published_at` |
| Denormalised | `avg_rating`, `review_count`, `booking_count`, `popularity_score` |
| Search | `search_vector` `tsvector` |

Two table-level checks carry real weight:

```sql
constraint spaces_has_a_price check (
  price_hourly_paise is not null
  or price_daily_paise is not null
  or price_monthly_paise is not null
),
constraint spaces_active_requires_completeness check (
  status <> 'active' or (
    description is not null and char_length(description) >= 40
    and approx_lat is not null and approx_lng is not null
  )
)
```

A listing cannot go live without a price, a real description and a jittered
coordinate. That is a database rule, not a form rule, so it holds regardless of
which code path tried to publish.

### space_photos

`storage_path`, `caption`, `photo_kind` (entrance, space, access, street,
surroundings, signage), `sort_order`, `width`, `height`, `blurhash`.

### availability_rules

The recurring weekly pattern. `day_of_week` follows the Postgres convention
where 0 is Sunday. An overnight window such as 20:00 to 08:00 is one row with
`ends_next_day = true` rather than two rows, because hosts think in terms of one
window and splitting it corrupts the edit experience. Check:
`ends_next_day or end_time > start_time`.

**No rules at all means always available.** That is the deliberate default for a
host who just wants the space bookable around the clock, and
`is_within_availability_rules` returns true immediately when `rule_count = 0`.

### availability_blocks and price_overrides

Both carry a generated `period tstzrange` and a GiST index on
`(space_id, period)`. Blocks are blackouts that override the weekly pattern.
Overrides apply `multiplier_bp` (1000..100000, where 15000 is 1.5x for a match
night). The MVP ships manual overrides only; algorithmic pricing in a later
version writes into the same table so the booking engine never learns a second
pricing path.

## 7. Booking tables

### bookings

| Group | Columns |
| --- | --- |
| Identity | `id`, `code` unique (`PS-XXXXXX`, alphabet without 0/O or 1/I/L because these are read aloud to security guards) |
| Parties | `space_id` restrict, `driver_id` restrict, `host_id` restrict, `vehicle_id` set null |
| Slot | `bay_index` (>= 0), `starts_at`, `ends_at`, `period` generated |
| Lifecycle | `status`, `hold_expires_at` |
| Money | `base_amount_paise`, `discount_amount_paise`, `wallet_applied_paise`, `service_fee_paise`, `tax_amount_paise`, `total_amount_paise`, `host_commission_paise`, `host_payout_paise`, `currency` |
| Frozen rates | `commission_rate_bp`, `service_fee_rate_bp`, `tax_rate_bp` |
| Coupon | `coupon_code`, `coupon_id` |
| Access | `qr_token` (24 random bytes hex, never the booking id, because the id appears in URLs) |
| Stay | `checked_in_at`, `checked_out_at`, `checkin_lat`, `checkin_lng`, `checkin_distance_m` |
| Overstay | `overstay_minutes`, `overstay_amount_paise`, `overstay_settled` |
| Extension | `extended_from_ends_at`, `extension_count` |
| Cancellation | `cancelled_at`, `cancelled_by`, `cancellation_reason`, `refund_amount_paise` |
| Evidence | `space_snapshot` `jsonb`, `driver_notes` |

Five table-level constraints:

| Constraint | Rule |
| --- | --- |
| `bookings_ordered` | `ends_at > starts_at` |
| `bookings_checkout_after_checkin` | Checkout may not precede check-in |
| `bookings_hold_has_expiry` | A `pending` row must carry `hold_expires_at` |
| `bookings_cancel_fields` | A `cancelled` row must name when and by whom |
| `bookings_total_is_consistent` | `total = base - discount - wallet + service_fee + tax`, checked on every write |

The last one is the arithmetic identity from spec kernel section 7, enforced by
the database. No code path can produce a booking whose total does not add up.

### booking_events

Append-only, `bigserial` primary key, never updated and never deleted. Written by
the `log_booking_event` trigger on insert and on every status change, and
explicitly by `confirm_booking`, `cancel_booking`, `check_in_booking`,
`check_out_booking` and `extend_booking` with operation-specific metadata.
Disputes are won and lost on this table.

## 8. The `bookings_no_overlap` exclusion constraint

This is the most important object in the schema.

```sql
period tstzrange generated always as (tstzrange(starts_at, ends_at, '[)')) stored,

alter table bookings
  add constraint bookings_no_overlap
  exclude using gist (
    space_id  with =,
    bay_index with =,
    period    with &&
  )
  where (status in ('pending', 'confirmed', 'active'));
```

### What it does

It forbids the database from holding two rows that simultaneously satisfy all
three of: same `space_id`, same `bay_index`, and overlapping `period`, among rows
whose status is `pending`, `confirmed` or `active`. Postgres enforces this with a
GiST index at commit time. There is no application locking, no advisory lock, no
optimistic retry loop and no race.

### Why `btree_gist` is required

A GiST index understands `&&` on a range natively. It does not, out of the box,
understand `=` on a `uuid` or a `smallint`. `btree_gist` supplies GiST operator
classes for the ordinary btree-indexable scalar types, which is what allows
`space_id WITH =` and `bay_index WITH =` to appear in the same index definition
as `period WITH &&`. Without the extension, migration 0004 fails outright. The
migration carries a comment on the extension saying exactly this, so nobody
removes it while tidying.

### Why the range is half-open

`tstzrange(starts_at, ends_at, '[)')` is start-inclusive and end-exclusive. A
booking ending at 14:00 and a booking starting at 14:00 therefore do **not**
overlap. That is the correct semantics for parking: the outgoing car leaves as
the incoming car arrives. A closed range `[]` would make back-to-back bookings
impossible and would silently destroy roughly one slot of inventory at every
boundary in the day. Every other range in the schema, `availability_blocks.period`
and `price_overrides.period`, uses the same `'[)'` convention, and every
`&&` test in `count_free_bays`, `next_free_bay`, `is_space_available`,
`extend_booking` and `space_availability_calendar` constructs its probe range the
same way. The convention is uniform, which is what stops an off-by-one at a
boundary.

### Why pending holds participate

`pending` is in the `WHERE` clause, so a hold reserves the bay while the driver
is on the payment screen. This is the difference between a product where two
drivers can both reach the gateway for the same bay, and one where they cannot.
Without it, the loser discovers the problem after their money has moved, which
is the single worst failure this product can produce.

`cancelled`, `expired`, `no_show` and `completed` are excluded from the
constraint, so a released interval becomes resellable the instant the status
changes, with no cleanup step and no index rebuild.

### What happens to the losing transaction

The loser's `INSERT` raises SQLSTATE `23P01`, `exclusion_violation`.
`create_booking_hold` catches exactly that:

```sql
exception
  when exclusion_violation then
    return jsonb_build_object('ok', false, 'error', 'SPACE_NO_LONGER_AVAILABLE');
```

The route maps `SPACE_NO_LONGER_AVAILABLE` through `ERROR_CATALOGUE` to HTTP 409
with the copy "Someone just booked this space for those times." and the action
"See what else is nearby". The comment in the migration is explicit that this is
the happy path of a lost race, not an error worth alarming on. `extend_booking`
catches the same SQLSTATE and returns `EXTENSION_BLOCKED`.

Note the ordering inside `create_booking_hold`: it calls `is_space_available`
and `next_free_bay` first, which handles the ordinary case cheaply and produces
a specific error, and relies on the constraint only for the genuine race where
two transactions pass those checks microseconds apart. The advisory check is the
fast path; the constraint is the guarantee.

## 9. Generated columns

| Table | Column | Definition | Why generated |
| --- | --- | --- | --- |
| `bookings` | `period` | `tstzrange(starts_at, ends_at, '[)')` stored | The exclusion constraint indexes this. Generating it means `starts_at`, `ends_at` and `period` can never disagree |
| `availability_blocks` | `period` | Same | Indexed by GiST for overlap tests |
| `price_overrides` | `period` | Same | Indexed by GiST for overlap tests |

All three are `STORED`, because a GiST index cannot be built over a virtual
column.

## 10. Indexes

Every index and the query it serves.

| Index | Table | Serves |
| --- | --- | --- |
| `profiles_role_idx` | profiles | Admin filters by role |
| `profiles_referral_code_idx` | profiles | Referral code lookup at sign-up |
| `profiles_referred_by_idx` (partial) | profiles | "Who did I refer" |
| `vehicles_owner_registration_key` (unique) | vehicles | One plate per owner, and plate lookup |
| `vehicles_one_default_per_owner` (partial unique) | vehicles | Exactly one default vehicle per owner, enforced by the index rather than by code |
| `vehicles_owner_idx` | vehicles | The garage list |
| `host_profiles_kyc_idx` | host_profiles | The KYC moderation queue |
| `host_profiles_superhost_idx` (partial) | host_profiles | Superhost badge joins in search |
| `verification_documents_user_idx` | verification_documents | A user's own documents |
| `verification_documents_status_idx` (partial) | verification_documents | The pending and in-review queue only |
| `spaces_host_idx` | parking_spaces | The host's listing list |
| `spaces_status_idx` | parking_spaces | The moderation queue |
| `spaces_city_locality_idx` (partial, active) | parking_spaces | The local SEO pages, `/parking/[city]/[area]` |
| `spaces_vehicle_types_idx` (GIN) | parking_spaces | `p_vehicle_type = any(vehicle_types)` in search |
| `spaces_amenities_idx` (GIN) | parking_spaces | `amenities @> p_amenities` in search |
| `spaces_search_vector_idx` (GIN) | parking_spaces | Full-text search over public-safe fields |
| `spaces_title_trgm_idx` (GIN trigram) | parking_spaces | Fuzzy title matching |
| `spaces_geo_idx` (partial, active) | parking_spaces | The bounding-box prefilter in `search_spaces`, which narrows by rectangle before the exact haversine circle |
| `space_photos_space_idx` | space_photos | Photos in `sort_order`, and the `limit 1` primary photo in search |
| `availability_rules_space_idx` | availability_rules | The day-by-day walk in `is_within_availability_rules` |
| `availability_blocks_space_period_idx` (GiST) | availability_blocks | Blackout overlap test |
| `price_overrides_space_period_idx` (GiST) | price_overrides | Override overlap test in `price_quote_paise` |
| `bookings_no_overlap` (GiST exclusion) | bookings | The correctness guarantee, and incidentally every `space_id + period &&` probe |
| `bookings_driver_idx` | bookings | "My bookings", newest first |
| `bookings_host_idx` | bookings | The host booking list |
| `bookings_space_idx` | bookings | Bookings against one listing |
| `bookings_status_idx` | bookings | Admin filters |
| `bookings_code_idx` | bookings | Lookup by the code read aloud at a gate |
| `bookings_qr_token_idx` | bookings | QR scan at the barrier |
| `bookings_hold_expiry_idx` (partial, pending) | bookings | The `expire_stale_holds` sweeper |
| `bookings_upcoming_idx` (partial, confirmed) | bookings | The reminder scheduler and the no-show sweeper |
| `bookings_active_idx` (partial, active) | bookings | The auto-complete sweeper |
| `booking_events_booking_idx` | booking_events | The timeline on a booking page |
| `payments_booking_idx` | payments | Payments for a booking |
| `payments_payer_idx` | payments | A user's payment history |
| `payments_provider_payment_idx` | payments | The webhook's order-id lookup |
| `payments_status_idx` | payments | Reconciliation |
| `webhook_events_unprocessed_idx` (partial) | webhook_events | Finding events that never finished processing |
| `refunds_booking_idx` | refunds | Refunds for a booking |
| `refunds_status_idx` (partial) | refunds | The refund work queue |
| `payouts_host_idx`, `payouts_status_idx` | payouts | Host earnings, payout runs |
| `reviews_space_idx` (partial, published and not hidden) | reviews | The public review list on a listing |
| `reviews_subject_idx` (partial) | reviews | Reviews about a person |
| `reviews_author_idx` | reviews | Reviews a person wrote |
| `messages_booking_idx` | messages | The thread |
| `messages_unread_idx` (partial) | messages | Unread badges |
| `disputes_booking_idx` | disputes | Disputes on a booking |
| `disputes_status_idx` (partial, open set) | disputes | The support queue ordered by `(status, priority)` |
| `disputes_assigned_idx` (partial) | disputes | An agent's caseload |
| `coupons_code_idx` on `upper(code)` | coupons | Case-insensitive code lookup, matching `where upper(code) = upper(trim(...))` in `quote_booking` |
| `coupons_active_idx` (partial) | coupons | The live campaign list |
| `coupon_redemptions_user_idx` | coupon_redemptions | The per-user redemption count |
| `wallet_transactions_user_idx` | wallet_transactions | The ledger, newest first |
| `referrals_referrer_idx` | referrals | "People I invited" |
| `notifications_dedupe_idx` (partial unique) | notifications | The dedupe mechanism, see section 13 |
| `notifications_user_idx`, `notifications_unread_idx` (partial) | notifications | The inbox and the unread count |
| `notifications_pending_idx` (partial, unsent) | notifications | The cron drain query |
| `audit_logs_actor_idx`, `audit_logs_entity_idx`, `audit_logs_action_idx` | audit_logs | Three audit query shapes |
| `search_events_created_idx` | search_events | Recent searches |
| `search_events_zero_results_idx` (partial, `result_count = 0`) | search_events | **The supply gap map.** Carries a comment saying zero-result searches are the demand signal that tells the field team which street to canvass next |

## 11. Triggers

| Trigger | Table | Timing | What it enforces |
| --- | --- | --- | --- |
| `*_updated_at` (on 12 tables) | many | before update | `updated_at := now()` |
| `on_auth_user_created` | `auth.users` | after insert | Creates the `profiles` row with a collision-checked referral code. Security definer. No authenticated user can exist without a profile |
| `vehicles_normalise_registration` | vehicles | before insert/update of reg | Uppercases and strips separators, so "WB 02 AB 1234" and "wb02ab1234" are the same vehicle |
| `vehicles_ensure_default` | vehicles | before insert/update of `is_default` | Demotes the previous default; makes the first vehicle default automatically |
| `parking_spaces_jitter` | parking_spaces | before insert/update of lat,lng | The location privacy rule, section 12 |
| `parking_spaces_search` | parking_spaces | before insert/update of title, description, locality, city, amenities | Rebuilds `search_vector` with weights A..D and generates `slug` once. Deliberately excludes `address_line`, `landmark` and `access_instructions`, so full-text search can never be used to fish for an exact address |
| `parking_spaces_published` | parking_spaces | before update of status | Stamps `published_at` the first time a listing reaches `active` |
| `bookings_transition_guard` | bookings | before update of status | The state machine, section 14 |
| `bookings_counters` | bookings | after update of status | Maintains `profiles.bookings_completed`, `profiles.bookings_cancelled`, `parking_spaces.booking_count`, `host_profiles.total_earnings_paise`, `host_profiles.payable_balance_paise`, `host_profiles.cancellation_count_90d` |
| `bookings_event_log` | bookings | after insert or update of status | Appends to `booking_events` |
| `bookings_guard_direct` | bookings | before update | Blocks a client changing `status` and silently reverts 17 money and slot columns to their old values. Money is immutable from the client, full stop |
| `payments_updated_at`, `refunds_updated_at`, `payouts_updated_at` | | before update | |
| `reviews_publish_pair` | reviews | after insert | Publishes both halves as soon as the second arrives, which is what makes the blind window work |
| `reviews_aggregates` | reviews | after insert/update/delete | Recomputes `parking_spaces.avg_rating` and `review_count` from published, unhidden, `driver_to_host` reviews |
| `messages_redact` | messages | before insert | Replaces runs of 10+ digits and email addresses with `[contact hidden]` and sets `redacted`. Skipped for system messages |
| `wallet_transactions_apply` | wallet_transactions | before insert | Section 13 |
| `profiles_guard_privileged` | profiles | before update | Reverts 11 privileged columns unless `is_full_admin()` |
| `host_profiles_guard` | host_profiles | before update | Reverts 9 columns including KYC status, Superhost and both balances |
| `spaces_guard` | parking_spaces | before update | Reverts aggregates and moderation fields; raises `check_violation` if a host tries to reach `active` from anything but `active` or `paused`, or to set `rejected` |
| `platform_settings_updated_at` | platform_settings | before update | |

## 12. The location jitter trigger

Spec kernel section 10 says a public coordinate must be offset by 80 to 150
metres. `apply_location_jitter()` implements it:

```sql
seed       := ('x' || substr(md5(new.id::text), 1, 8))::bit(32)::bigint / 4294967296.0;
bearing    := 2 * pi() * seed;
distance_m := 80 + 70 * (('x' || substr(md5(new.id::text), 9, 8))::bit(32)::bigint / 4294967296.0);
d_lat := (distance_m * cos(bearing)) * lat_degrees_per_m();
d_lng := (distance_m * sin(bearing)) * lng_degrees_per_m(new.lat);
```

Three properties matter:

1. **Deterministic.** Both pseudo-random values are derived from `md5(id)`, not
   from `random()`. The same space always jitters to the same point.
2. **Stable across updates.** The first branch of the function returns early
   when `approx_lat` is already set and neither `lat` nor `lng` changed. A marker
   that moved on every page load would look broken, and would also leak the true
   point through averaging across repeated requests, which is the attack this
   defends against.
3. **Uniform in bearing, 80 to 150 m in distance.** The offset is a real vector,
   not an axis-aligned nudge, so the jitter does not reveal a grid.

The result is rounded to six decimal places, roughly 0.1 m, which is well below
the jitter magnitude and so leaks nothing.

## 13. The wallet ledger and its balance invariant

`wallet_transactions` is append-only. Rows are never updated.
`profiles.wallet_balance_paise` is a cache of the signed sum and can always be
rebuilt from the ledger.

| Column | Note |
| --- | --- |
| `txn_type` | `wallet_txn_type`, seven values |
| `amount_paise` | Signed. Credits positive, debits negative. `check (amount_paise <> 0)` |
| `balance_after_paise` | `check (>= 0)`. Written by the trigger, never by the caller |
| `reference_type`, `reference_id` | What the movement was for, for example `('booking', <uuid>)` |
| `expires_at` | Promotional credit with a shelf life |

The invariant is enforced by `wallet_apply_transaction()`, a `before insert`
trigger:

```sql
select wallet_balance_paise into current_balance
  from profiles where id = new.user_id for update;

if current_balance + new.amount_paise < 0 then
  raise exception 'Insufficient wallet balance: have %, need %', ...
    using errcode = 'check_violation';
end if;

new.balance_after_paise := current_balance + new.amount_paise;
update profiles set wallet_balance_paise = new.balance_after_paise where id = new.user_id;
```

The `for update` row lock is the important part. Two concurrent debits serialise
on the profile row, so the balance cannot go negative through interleaving.
`balance_after_paise` is overwritten by the trigger regardless of what the caller
supplied, which makes the ledger self-auditing: for any user, the ledger ordered
by `created_at` must show each row's `balance_after_paise` equal to the previous
one plus `amount_paise`, and the final value must equal
`profiles.wallet_balance_paise`. A mismatch is a bug, and it is detectable with
one query.

Wallet inserts are closed to clients by RLS: `wallet_admin_write` requires
`is_full_admin()`. Credits originate only in server logic, specifically
`confirm_booking` (the `booking_spend` debit) and `cancel_booking` (the
`refund_credit`).

## 14. The booking state machine

`enforce_booking_transition()` runs `before update of status` and rejects an
illegal jump with `check_violation`.

| From | Permitted to |
| --- | --- |
| `draft` | `pending`, `cancelled`, `expired` |
| `pending` | `confirmed`, `cancelled`, `expired` |
| `confirmed` | `active`, `cancelled`, `no_show`, `disputed` |
| `active` | `completed`, `disputed` |
| `completed` | `disputed` |
| `disputed` | `completed`, `cancelled` |
| `cancelled`, `expired`, `no_show` | nothing, terminal |

A no-op update where `old.status = new.status` returns early and is always
allowed. The application is not trusted to make only legal transitions; the
database rejects an illegal one outright.

## 15. Views

### public_spaces

Created `with (security_invoker = false)`, so it runs with the definer's rights
and is not itself subject to the caller's RLS on `parking_spaces`. It selects the
public columns unconditionally and wraps the six protected ones in a case
expression:

```sql
case when has_address_access(ps.id) or ps.host_id = auth.uid() or is_admin()
     then ps.address_line end as address_line,
-- likewise landmark, exact_lat, exact_lng, access_instructions, access_pin
```

`has_address_access(space_id)` is true only when the caller holds a booking on
that space with status `confirmed`, `active` or `completed`, and
`now() >= starts_at - interval '24 hours'`. Access stays readable after the stay
so the driver can find their receipt and dispute evidence.

**Why the view exists rather than a careful `select` list:** the browser role has
`select` on `parking_spaces` revoked entirely and re-granted column by column
without the six protected columns. A mistaken query therefore cannot select
`address_line` even if somebody writes one. The privacy rule is a grant, and the
view is how the legitimate conditional release is expressed. `src/lib/types.ts`
carries the fact forward into the type system: those six fields are typed
nullable with a comment saying null means "you are not entitled to it", not "it
is missing".

### public_profiles

Also `security_invoker = false`. Exposes `id`, `full_name`, `avatar_url`,
`trust_score`, `bookings_completed`, `member_since`, `is_verified`,
`is_superhost`, `host_display_name`, `response_rate_bp` and
`avg_response_minutes`, filtered by `where not p.is_suspended`. It exists because
`profiles` itself is readable only by its owner and admins, and host cards and
review author lines still need a safe projection of somebody else.

## 16. Deliberate denormalisation

Eleven values are stored rather than computed. Each one is here because it feeds
search ranking, a list view, or a receipt, and computing it on read would mean a
correlated subquery per row.

| Value | Location | Kept correct by | Failure mode if the trigger is lost |
| --- | --- | --- | --- |
| `profiles.wallet_balance_paise` | profiles | `wallet_apply_transaction` before insert | Rebuildable: sum the ledger |
| `profiles.bookings_completed` | profiles | `bookings_maintain_counters` after status change | Rebuildable: count completed bookings |
| `profiles.bookings_cancelled` | profiles | Same, when `cancelled_by = 'driver'` | Rebuildable |
| `profiles.trust_score` | profiles | `recompute_trust_score(user_id)`, called explicitly | Rebuildable, but nothing in this build calls it on a schedule. See the note below |
| `parking_spaces.avg_rating` | parking_spaces | `reviews_refresh_aggregates` after any review write | Rebuildable: average published `driver_to_host` ratings |
| `parking_spaces.review_count` | parking_spaces | Same | Rebuildable |
| `parking_spaces.booking_count` | parking_spaces | `bookings_maintain_counters` | Rebuildable |
| `parking_spaces.popularity_score` | parking_spaces | Nothing in this build writes it. It stays 0 and contributes 0 to relevance | Inert, not incorrect |
| `parking_spaces.search_vector` | parking_spaces | `parking_spaces_search_refresh` before insert/update of the five source columns | Rebuildable by touching the row |
| `host_profiles.total_earnings_paise` | host_profiles | `bookings_maintain_counters` on completion, plus `cancel_booking` crediting the host's share of a forfeit | Rebuildable from completed bookings plus refund splits |
| `host_profiles.payable_balance_paise` | host_profiles | Same | Rebuildable, but see limitation below |
| `host_profiles.cancellation_count_90d` | host_profiles | `bookings_maintain_counters` when `cancelled_by = 'host'` | **Not rebuildable as named.** It only ever increments; nothing ages entries out of the 90-day window, so despite the column name it is a lifetime count |
| `host_profiles.is_superhost` | host_profiles | `refresh_superhost_badges()`, run by cron every 5 minutes | Rebuildable |
| `bookings.space_snapshot` | bookings | Written once by `create_booking_hold` | **Intentionally frozen.** When a host edits the title or the price six months later, the driver's receipt must still describe what they actually bought |
| `bookings.commission_rate_bp`, `service_fee_rate_bp`, `tax_rate_bp` | bookings | Written once from `platform_settings` at quote time | **Intentionally frozen.** Changing `HOST_COMMISSION_PCT` next month must never restate last month's bookings, so the rate travels with the booking rather than being looked up |

Two honest caveats:

- `recompute_trust_score()` exists and is correct, but no trigger and no cron
  step invokes it. `trust_score` therefore sits at its default of 50 for every
  user in this build.
- `payable_balance_paise` only ever increases. Nothing decrements it when a
  payout is made, because nothing makes payouts. See
  `15_Payment_Specification.md`.

## 17. platform_settings, the business rule engine

Sixteen keys seeded on first migration, each a `jsonb` value with a description,
read through `setting_numeric(key, fallback)` and `setting_int(key, fallback)` so
callers never parse `jsonb` by hand.

| Key | Default | Read by |
| --- | --- | --- |
| `HOST_COMMISSION_PCT` | 0.10 | `quote_booking` |
| `DRIVER_SERVICE_FEE_PCT` | 0.05 | `quote_booking` |
| `GST_PCT` | 0.18 | `quote_booking`. Marked REVIEW REQUIRED with a chartered accountant in the seed row itself |
| `BOOKING_HOLD_MINUTES` | 10 | `create_booking_hold` |
| `GRACE_PERIOD_MINUTES` | 10 | `check_out_booking` |
| `MIN_BOOKING_MINUTES` | 30 | Documented global floor; per-space `min_booking_minutes` is what `is_space_available` actually enforces |
| `MAX_BOOKING_DAYS` | 90 | Documented global ceiling; per-space `max_advance_days` is what is enforced |
| `OVERSTAY_MULTIPLIER` | 1.5 | `check_out_booking` |
| `REFERRAL_REWARD_PAISE` | 10000 | Not read by any code in this build |
| `SEARCH_DEFAULT_RADIUS_M` | 1500 | Mirrored as the Zod default in `searchParamsSchema` |
| `SEARCH_MAX_RADIUS_M` | 10000 | Mirrored as the Zod max |
| `REVIEW_WINDOW_DAYS` | 14 | Cron step 3 |
| `SUPERHOST_MIN_RATING` | 4.7 | `refresh_superhost_badges` |
| `SUPERHOST_MIN_BOOKINGS` | 10 | `refresh_superhost_badges` |
| `PAYOUT_DELAY_HOURS` | 24 | Cron step 6 |
| `MAX_EXTENSIONS` | 3 | `extend_booking` |

`settings_public_read` makes the table world-readable, deliberately, because the
client needs the grace period and the hold duration to render honest copy. Only
`is_full_admin()` may write.

## 18. Tables that exist but are not yet written to

Accuracy matters more than completeness here.

| Table | Status |
| --- | --- |
| `payouts`, `payout_items` | Schema only. No code creates a payout |
| `audit_logs` | Schema and RLS only. Nothing inserts an audit row in this build |
| `referrals` | `confirm_booking` promotes a pending row to `qualified`, but nothing creates the pending row and nothing pays the reward |
| `messages` | Schema, redaction trigger and RLS are complete. No API route posts a message |
| `disputes` | Schema and RLS complete. No API route raises a dispute |
| `verification_documents` | Schema and RLS complete. No upload route |
| `space_photos` | Schema and RLS complete, and `search_spaces` selects the first photo. No upload route |
| `price_overrides` | Schema complete and read by `price_quote_paise`. No route writes one |
