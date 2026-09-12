# 14. Booking Engine Specification

> The heart of the system. Everything described here lives in migrations 0004,
> 0006, 0007 and 0009, and in the routes under `src/app/api/bookings/` and
> `src/app/api/payments/`. Section 11 walks every edge case with the exact
> behaviour, including the ones where the current behaviour is imperfect.

## 1. The guarantee

A confirmed booking is a hard reservation. Double-booking is structurally
impossible, not merely unlikely. That is delivered by one object:

```sql
period tstzrange generated always as (tstzrange(starts_at, ends_at, '[)')) stored,

alter table bookings
  add constraint bookings_no_overlap
  exclude using gist (space_id with =, bay_index with =, period with &&)
  where (status in ('pending', 'confirmed', 'active'));
```

Everything else in this document is either how a booking gets into that state or
how it gets out of it.

## 2. Lifecycle and the state machine

```
                  ┌──────────► expired        hold timed out, no payment landed
                  │
draft ─► pending ─┼──────────► cancelled      driver or host, before start
                  │
                  └─► confirmed ─► active ─► completed ─► (reviews attach here)
                           │          │
                           │          └────► disputed
                           └────► no_show
```

`enforce_booking_transition()` runs `before update of status` and rejects
anything else with `errcode = 'check_violation'` and the message
`Illegal booking transition % -> % for booking %`.

| From | May become | Written by |
| --- | --- | --- |
| `draft` | `pending`, `cancelled`, `expired` | Nothing in this build creates a `draft`. `create_booking_hold` inserts directly at `pending` |
| `pending` | `confirmed`, `cancelled`, `expired` | `confirm_booking`, `cancel_booking`, `expire_stale_holds` |
| `confirmed` | `active`, `cancelled`, `no_show`, `disputed` | `check_in_booking`, `cancel_booking`, `auto_complete_stale_bookings` |
| `active` | `completed`, `disputed` | `check_out_booking`, `auto_complete_stale_bookings` |
| `completed` | `disputed` | Nothing in this build raises a dispute |
| `disputed` | `completed`, `cancelled` | Nothing in this build resolves a dispute |
| `cancelled` | terminal | |
| `expired` | terminal | |
| `no_show` | terminal | |

A no-op where `old.status = new.status` returns early and is always permitted,
which is what lets `confirm_booking` and `check_in_booking` be idempotent without
tripping the guard.

Note which statuses hold inventory: `pending`, `confirmed` and `active` are in
the exclusion constraint's `WHERE` clause. Every terminal state and `completed`
are outside it, so a released interval becomes resellable the instant the status
changes, with no cleanup step.

Every transition is written to `booking_events` by the `bookings_event_log`
trigger, and the operational RPCs add their own rows with metadata
(`payment_confirmed`, `cancelled`, `checked_in`, `checked_out`, `extended`).

## 3. The hold mechanism

`create_booking_hold` inserts a row at `status = 'pending'` with

```sql
hold_expires_at = now() + make_interval(mins => setting_int('BOOKING_HOLD_MINUTES', 10))
```

The default is 10 minutes, changeable at runtime through `platform_settings`
with no deploy. A table constraint, `bookings_hold_has_expiry`, makes a `pending`
row without an expiry impossible.

The hold is what makes the payment screen safe. Without it, two drivers can both
reach the gateway for the same bay and one of them is guaranteed to be
disappointed after their money has moved. Because `pending` participates in the
exclusion constraint, the bay is genuinely reserved for the duration.

The checkout page shows a live countdown against `hold_expires_at`. That timer is
honest rather than a pressure tactic: the bay really does return to inventory,
and when the countdown reaches zero the page stops offering a Pay button that
would fail and says plainly that nothing has been charged.

### Expiry

`expire_stale_holds()` runs from cron every five minutes:

```sql
update bookings set status = 'expired', hold_expires_at = null
 where status = 'pending'
   and hold_expires_at is not null
   and hold_expires_at < now()
   and not exists (select 1 from payments p
                    where p.booking_id = bookings.id
                      and p.status in ('captured','authorized'));
```

The `not exists` clause is the important one. A hold with a captured or
authorized payment against it is **never** expired. The migration comment says
why: that is a reconciliation problem for a human, not a row to quietly discard.
Expiring it would leave a driver charged for a booking that no longer exists.

The sweeper is backed by `bookings_hold_expiry_idx`, a partial index on
`hold_expires_at where status = 'pending'`.

Because the sweeper runs every five minutes, a hold can outlive its nominal
expiry by up to five minutes. That slack is deliberate and is used: see
`confirm_booking` in section 6.

## 4. The availability algorithm

`is_space_available(p_space_id, p_starts_at, p_ends_at)` is the single source of
truth. The UI, the quote endpoint and the booking endpoint all call it, so they
cannot disagree about whether a space is free. Checks run in this exact order,
cheapest and most decisive first:

| # | Check | Fails when |
| --- | --- | --- |
| 1 | Space exists and `status = 'active'` | Not found, or draft, pending review, paused, rejected or delisted |
| 2 | `p_ends_at > p_starts_at` | Zero or negative duration |
| 3 | `duration_minutes >= s.min_booking_minutes` | Stay shorter than the host allows |
| 4 | `s.max_booking_minutes is null or duration_minutes <= s.max_booking_minutes` | Stay longer than the host allows |
| 5 | `p_starts_at >= now() + make_interval(mins => s.min_notice_minutes)` | Inside the notice period. The host needs warning before a car turns up |
| 6 | `p_starts_at <= now() + make_interval(days => s.max_advance_days)` | Beyond the booking horizon |
| 7 | No `availability_blocks` row whose `period && tstzrange(start, end, '[)')` | Host blackout |
| 8 | `is_within_availability_rules(space, start, end)` | Outside the weekly opening pattern |
| 9 | `count_free_bays(space, start, end) > 0` | Every bay is taken for some part of the window |

`duration_minutes` is computed as `extract(epoch from (ends - starts)) / 60`,
which truncates toward zero for the integer variable. Note that check 5 uses
`now()`, so an otherwise valid slot becomes unavailable the moment the clock
crosses into the notice window, even mid-checkout.

### is_within_availability_rules

Walks the interval day by day in the space's local timezone, defaulting to
`Asia/Kolkata`. The loop is bounded because the interval itself is bounded by
`max_advance_days`.

```
if the space has NO rules at all → return true
    (the deliberate default for a host who wants it bookable around the clock)

cursor := starts_at
while cursor < ends_at:
    local_day := (cursor at time zone tz)::date
    dow       := extract(dow from local_day)     -- 0 = Sunday

    for each rule on dow, ordered by start_time:
        win_start := (local_day + start_time) at time zone tz
        win_end   := (local_day + end_time + (1 day if ends_next_day)) at time zone tz
        if cursor >= win_start and cursor < win_end:
            covered_until := win_end; found := true; break

    if not found:
        -- a window opened by YESTERDAY that runs past midnight
        for each rule on (dow + 6) % 7 where ends_next_day:
            win_start := ((local_day - 1) + start_time) at time zone tz
            win_end   := ((local_day - 1) + end_time + 1 day) at time zone tz
            if cursor >= win_start and cursor < win_end:
                covered_until := win_end; found := true; break

    if not found: return false
    cursor := covered_until

return true
```

The second loop is what makes an overnight window such as 20:00 to 08:00 work
without splitting it into two rows. Hosts think in terms of one window, and
splitting it corrupts the edit experience, so the complexity lives here instead.

Walking day by day rather than doing clever range arithmetic keeps the function
readable, which for a predicate this load-bearing is the right trade.

### count_free_bays

```sql
greatest(ps.capacity - (
  select count(distinct b.bay_index) from bookings b
   where b.space_id = p_space_id
     and b.status in ('pending','confirmed','active')
     and b.period && tstzrange(p_starts_at, p_ends_at, '[)')
     and (p_exclude_booking is null or b.id <> p_exclude_booking)
), 0)::integer
```

`count(distinct bay_index)` is the correct question, not `count(*)`. A bay is
unusable if it is taken for **any part** of the requested window, and one bay may
carry several non-overlapping bookings inside that window. Counting rows would
undercount free bays; counting distinct bays does not.

`p_exclude_booking` exists for `confirm_booking`, which needs to ask "would this
bay be free if my own pending row did not exist".

## 5. The pricing algorithm

`price_quote_paise(space, starts_at, ends_at)` returns the base amount in paise,
before coupons, wallet, fees and tax.

### Cheapest-combination logic

```
total_minutes := ceil(epoch(ends - starts) / 60.0)
remaining     := total_minutes

if monthly price offered:  months := remaining / (30*24*60);  remaining -= months * 43200
if daily   price offered:  days   := remaining / (24*60);     remaining -= days   * 1440
if hourly  price offered:  hours  := ceil(remaining / 60.0);  remaining := 0
elsif remaining > 0 and daily offered:    days   += 1;  remaining := 0   -- tail rounds to a day
elsif remaining > 0 and monthly offered:  months += 1;  remaining := 0   -- tail rounds to a month

best := months*monthly + days*daily + hours*hourly
```

The block divisions are integer divisions, so they truncate, which is what makes
the greedy descent correct: take as many whole large blocks as fit, then price
the remainder at the next tier down.

A driver booking 26 hours on a space priced both hourly and daily should pay for
one day plus two hours, not twenty-six hours.

**Worked example.** Space priced Rs 50 per hour (5000 paise) and Rs 300 per day
(30000 paise). Booking 26 hours, 1560 minutes:

| Step | Value |
| --- | --- |
| `days = 1560 / 1440` | 1, remaining 120 |
| `hours = ceil(120 / 60)` | 2, remaining 0 |
| `best = 1×30000 + 2×5000` | **40000 paise, Rs 400** |

### The next-block-up cap

```sql
if s.price_hourly_paise is not null and s.price_daily_paise is not null then
  hourly_only := ceil(total_minutes / 60.0)::bigint * s.price_hourly_paise;
  best := least(best,
                hourly_only,
                (ceil(total_minutes / (24.0*60.0))::bigint) * s.price_daily_paise);
end if;
```

The cap guarantees two things a driver would otherwise notice and resent: the
combination price is never worse than pricing the whole stay hourly, and it is
never worse than pricing the whole stay in whole days.

**Worked example.** Same space, 23 hours, 1380 minutes:

| Candidate | Value |
| --- | --- |
| Greedy combination: 0 days + 23 hours | 115000 |
| Hourly only: `ceil(1380/60) = 23` × 5000 | 115000 |
| Days rounded up: `ceil(1380/1440) = 1` × 30000 | **30000** |
| `least(...)` | **30000 paise, Rs 300** |

Twenty-three hours cannot cost more than one day. That is the rule the cap
exists to hold.

**Limitation:** the cap only applies when **both** hourly and daily prices are
set. A space priced only daily and monthly gets no monthly cap, so 29 days on a
space at Rs 200 per day and Rs 4000 per month prices at Rs 5800 rather than
being capped at the monthly rate. That is a genuine gap in the current function.

### Price overrides

```sql
select max(multiplier_bp) into multiplier_bp from price_overrides po
 where po.space_id = p_space_id and po.period && tstzrange(p_starts_at, p_ends_at, '[)');

best := (best * coalesce(multiplier_bp, 10000)) / 10000;
```

The **largest** overlapping multiplier wins, and it applies to the whole stay,
not pro rata to the overlapping portion. A booking that clips one hour of a
1.5x match-night window pays 1.5x on the entire stay. This is a deliberate
simplification and it is worth knowing about.

The multiplication happens before the division, so precision is preserved, and
the result is an integer division on `bigint`, so it truncates in the driver's
favour.

### The full breakdown, in quote_booking

Rates are read from `platform_settings` once and then frozen onto the booking
row, so a later change to `HOST_COMMISSION_PCT` cannot restate an existing
booking.

```
base            = price_quote_paise(...)
discount        = coupon, capped at max_discount_paise and at base
taxable         = base - discount
wallet_applied  = least(wallet_balance, taxable)      if use_wallet
taxable         = taxable - wallet_applied
service_fee     = round(taxable * service_bp / 10000)
tax             = round(service_fee * tax_bp / 10000)
total           = taxable + service_fee + tax
commission      = round((base - discount) * commission_bp / 10000)   ← PRE-wallet
host_payout     = (base - discount) - commission
```

Commission is charged on the **pre-wallet** amount. A wallet credit is the
platform's promotional cost, not the host's, and the host must be paid exactly as
if the driver had paid cash. `src/lib/money.ts` mirrors this exactly and the test
suite asserts it: `withWallet.hostPayout === withoutWallet.hostPayout`.

The `bookings_total_is_consistent` check constraint enforces the arithmetic at
the storage layer on every write.

## 6. Bay allocation

```sql
create or replace function next_free_bay(p_space_id uuid, p_starts_at timestamptz, p_ends_at timestamptz)
returns smallint language sql stable as $$
  select gs::smallint
    from parking_spaces ps, generate_series(0, ps.capacity - 1) gs
   where ps.id = p_space_id
     and not exists (select 1 from bookings b
                      where b.space_id = p_space_id and b.bay_index = gs
                        and b.status in ('pending','confirmed','active')
                        and b.period && tstzrange(p_starts_at, p_ends_at, '[)'))
   order by gs limit 1;
$$;
```

The **lowest** free index wins. That is deliberate: allocation is deterministic
and compacting, so on a capacity-8 basement the bookings cluster at bays 0, 1, 2
rather than scattering, and a host reading the calendar sees a coherent picture.
It also means `bay_index` is stable and predictable for the same booking pattern,
which makes reproducing a bug much easier.

A single-bay space always allocates bay 0, and the exclusion constraint reduces
to "one live booking per overlapping interval".

Returning `null` means no bay is free. `create_booking_hold` treats that as
`SPACE_NO_LONGER_AVAILABLE`.

## 7. The concurrency guarantee

`create_booking_hold` runs in one transaction and does its work in this order:

```
1. auth.uid() present?                      → NOT_AUTHENTICATED
2. profile not suspended?                   → ACCOUNT_SUSPENDED
3. space exists and active?                 → SPACE_NOT_AVAILABLE
4. host_id <> caller?                       → CANNOT_BOOK_OWN_SPACE
5. vehicle belongs to caller?               → VEHICLE_NOT_YOURS
6. vehicle fits (L/W/H vs space limits)?    → VEHICLE_DOES_NOT_FIT
7. vehicle type accepted by the space?      → VEHICLE_TYPE_NOT_ACCEPTED
8. is_space_available(...)?                 → SPACE_NO_LONGER_AVAILABLE
9. next_free_bay(...) not null?             → SPACE_NO_LONGER_AVAILABLE
10. quote_booking(...) ok?                  → passes the quote's error through
11. INSERT ... status='pending'
      exception when exclusion_violation    → SPACE_NO_LONGER_AVAILABLE
```

Steps 8 and 9 are the **advisory** check. They handle the ordinary case cheaply
and produce a clear error. Step 11 is the **guarantee**. Between step 9 reading
and step 11 writing there is a window of microseconds in which another
transaction can commit for the same bay, and the exclusion constraint is what
closes it.

The loser receives SQLSTATE `23P01`. The migration comment is explicit that this
is the happy path of a lost race, not an error worth alarming on. It is mapped
to `SPACE_NO_LONGER_AVAILABLE`, HTTP 409, with the copy "Someone just booked this
space for those times." and the action "See what else is nearby".

There is no application-level locking, no advisory lock, no optimistic retry
loop, and no race. Note also that the function does **not** retry with the next
bay after an exclusion violation; a capacity-8 space under heavy contention could
in principle lose a race on bay 0 and return "no longer available" while bay 1
was free. In practice `next_free_bay` re-reads on the client's retry and the
window is microseconds wide, but it is a known and deliberate simplification.

## 8. Confirmation

`confirm_booking(p_booking_id, p_payment_id)` is revoked from `anon` and
`authenticated`. Only the service role may call it, and only after a webhook
signature has been verified and the amount checked.

```
SELECT ... FOR UPDATE                       -- serialise concurrent webhooks
if status = 'confirmed' → return {ok:true, already:true}    -- idempotent
if status <> 'pending'  → return {ok:false, BOOKING_NOT_PENDING}
if hold_expires_at < now()
   AND count_free_bays(space, starts, ends, EXCLUDING this booking) <= 0
       → return {ok:false, HOLD_EXPIRED_AND_TAKEN}
UPDATE status='confirmed', hold_expires_at=null
spend the wallet portion (wallet_transactions, booking_spend, negative)
record the coupon redemption (on conflict do nothing) and bump redemption_count
promote any pending referral for this driver to 'qualified'
append a 'payment_confirmed' booking_event
```

The lapsed-hold branch is the interesting one. It does **not** refuse just
because the hold expired. It refuses only if the hold expired **and** the bay has
since been taken by someone else. The comment states the reasoning: the bay might
still be free, in which case we honour the payment rather than punishing the
driver for the gateway's latency.

The coupon redemption is recorded at confirmation, not at quote time. A quote is
not a claim on a coupon, and recording it earlier would let a driver exhaust a
limited campaign by repeatedly quoting.

## 9. Check-in and check-out

**Check-in** (`check_in_booking`) permits either the driver or the host, is
idempotent when already `active`, requires status `confirmed`, and opens 30
minutes before `starts_at`. Thirty minutes is generous on purpose: traffic is
real and a driver idling at a gate is a support ticket waiting to happen. A
coordinate is optional; when supplied, `checkin_distance_m` is computed against
the **true** space coordinate and stored as a fraud signal for later review, not
as a reason to block the driver standing at the gate.

**Check-out** (`check_out_booking`) permits either party, is idempotent when
already `completed`, requires status `active`, and computes overstay:

```sql
if now() > b.ends_at + make_interval(mins => grace) then
  over_minutes := ceil(epoch(now() - b.ends_at) / 60.0);
  hourly       := coalesce(price_hourly_paise, price_daily_paise / 24);
  over_amount  := round(ceil(over_minutes / 60.0) * hourly * mult);
end if;
```

Overstay is charged **from the original end time**, not from the end of the grace
period. The grace period decides whether any charge applies at all; once it does,
the whole overstay is billable. Charging from the end of grace would mean a
driver 11 minutes late pays for 1 minute, which reads as a trick the first time
somebody works it out. `src/lib/policy.test.ts` asserts exactly this: 11 minutes
late, 10 minute grace, Rs 50 per hour, 1.5x gives Rs 75.

`overstay_settled` is set to `(over_amount = 0)`, so a non-zero overstay lands
unsettled. **Nothing in this build collects it.** The amount is computed and
recorded; no payment intent is created for it.

## 10. Extension

`extend_booking(p_booking_id, p_new_ends_at)`, driver only:

| Check | Error |
| --- | --- |
| Caller is the driver | `NOT_AUTHORIZED` |
| Status is `confirmed` or `active` | `NOT_EXTENDABLE` |
| `p_new_ends_at > b.ends_at` | `NOT_AN_EXTENSION` |
| `extension_count < MAX_EXTENSIONS` (default 3) | `EXTENSION_LIMIT_REACHED` |
| No other live booking on **this same bay** overlapping `[ends_at, new_ends_at)` | `EXTENSION_BLOCKED` |
| No `availability_blocks` row overlapping the tail | `EXTENSION_BLOCKED` |

The overlap probe is deliberately scoped to `o.bay_index = b.bay_index`. Another
bay being busy is irrelevant; only this driver's own bay matters, because the car
is physically in it.

The update then adds `extra_base = price_quote_paise(space, old_ends_at,
new_ends_at)` plus a proportional service fee and tax, and increases
`host_commission_paise` and `host_payout_paise` using the **frozen** rates on the
booking row rather than current settings. The whole update is wrapped in an
exception handler for `exclusion_violation`, which is the race equivalent of the
advisory check above.

`extended_from_ends_at` is stamped with `coalesce(extended_from_ends_at, ends_at)`
so the original end time survives repeated extensions.

**Limitation:** the extension is applied and the money is added to the booking
total, but no charge is taken. There is no payment intent for an extension in
this build.

## 11. Edge cases, with the exact behaviour

### 1. Two users book the same slot at the same instant

Both pass `is_space_available` and both get the same `bay_index` from
`next_free_bay`, because neither transaction can see the other's uncommitted row.
Both attempt the insert. Postgres serialises them on the GiST index: the first to
commit succeeds, the second raises `23P01`.

The loser's `create_booking_hold` catches `exclusion_violation` and returns
`{ok:false, error:'SPACE_NO_LONGER_AVAILABLE'}`. `POST /api/bookings` maps it to
HTTP 409 with "Someone just booked this space for those times." No money moved,
no partial row exists, and the transaction rolled back entirely.

**Exactly one booking exists.** This is the property the whole design is built
around.

### 2. Payment succeeded but the booking could not be confirmed

`handleSuccessfulPayment` calls `confirm_booking`. If it returns `ok: false`, the
handler throws:

```
PAYMENT TAKEN BUT BOOKING NOT CONFIRMED. booking=<id> payment=<id>
reason=<code>. Refund required.
```

The throw is caught by the outer `try`, written to
`webhook_events.processing_error`, and the endpoint still answers **200**. The
payment row is already marked `captured` before this point, so the money is
recorded even though the booking is not.

What happens next: **a human has to act.** There is no automatic refund and no
alert configured. The comment calls this "the most serious case in the whole
system" and the design choice is that it must never be swallowed silently. It is
recorded on a durable row and surfaced in the log. `27_Deployment_Strategy.md`
lists this string as a must-alert condition.

### 3. The webhook is delayed past hold expiry

Two sub-cases, and `confirm_booking` distinguishes them:

**The bay is still free.** `hold_expires_at < now()` but
`count_free_bays(space, starts, ends, excluding this booking) > 0`. The booking
is confirmed normally. The driver is not punished for the gateway's latency.

**The bay has been resold.** `count_free_bays(...) <= 0`. Returns
`HOLD_EXPIRED_AND_TAKEN`, which triggers case 2 above: the payment is captured,
the booking is not confirmed, a human must refund.

There is a further protection upstream: `expire_stale_holds` refuses to expire
any hold with a `captured` or `authorized` payment, so once the gateway has
authorised, the sweeper will not move the row out from under the webhook. The
race is only open in the window before authorisation is recorded.

Note also that the sweeper runs every five minutes, so a hold is not actually
`expired` at the instant `hold_expires_at` passes. It simply becomes eligible.
A webhook arriving 90 seconds late will usually find the row still `pending`.

### 4. The same webhook arrives twice

Three independent layers catch it:

1. **`webhook_events` unique constraint** on `(provider, provider_event_id)`.
   The second insert fails with `23505` and the handler returns
   `{ok:true, duplicate:true}` with HTTP 200 before doing any work at all.
2. **The payment update is conditional** on `payment.status !== 'captured'`, so
   a second capture event for an already-captured payment is a no-op.
3. **`confirm_booking` is idempotent.** `if b.status = 'confirmed' then return
   {ok:true, already:true}`.

The third layer also guards the side effects: because `confirm_booking` returns
early, the wallet debit, the coupon redemption and the referral promotion cannot
double-apply. The webhook handler checks `result.already` before queueing
notifications, so a duplicate does not queue a second set.

For Razorpay specifically, the event id is derived as
`${eventType}:${entityId}` rather than taken from the body, because Razorpay does
not put a stable event id in the body for every event type. Combined with the
unique constraint, that still gives exactly-once processing.

### 5. The host cancels after the driver has paid

`cancel_booking` resolves `by := 'host'` from `auth.uid()`, and
`compute_refund_paise` short-circuits:

```sql
if p_by in ('host', 'platform') then
  return jsonb_build_object(
    'refund_paise', b.total_amount_paise - b.wallet_applied_paise,
    'wallet_return_paise', b.wallet_applied_paise,
    'forfeited_paise', 0, 'platform_keeps_paise', 0, 'host_keeps_paise', 0,
    'service_fee_retained_paise', 0, 'reason', 'full_refund_host_or_platform');
```

The driver is made whole **including the service fee**, under every policy
including `non_refundable`. The driver did nothing wrong and should not be out of
pocket for someone else's change of mind. Nobody keeps anything.

Additionally `bookings_maintain_counters` increments
`host_profiles.cancellation_count_90d`, which is the reliability penalty, and a
`refunds` row is written with `status = 'requested'`.

**Limitation:** the refund row is created; no refund is issued. Neither
provider's `refund()` method is called from anywhere in the application.

### 6. The driver never arrives

`auto_complete_stale_bookings()` runs from cron:

```sql
update bookings set status = 'no_show'
 where status = 'confirmed' and ends_at < now() - interval '2 hours'
   and checked_in_at is null;
```

A confirmed booking whose entire window elapsed without a check-in becomes
`no_show` two hours after the end time. The host keeps the money under every
policy: `no_show` is terminal, there is no refund path out of it, and
`cancel_booking` refuses because the status is not in `('pending','confirmed')`.

Two consequences worth stating: the host's earnings are **not** credited by
`bookings_maintain_counters`, which only fires on `completed`, so a no-show
currently pays the host nothing despite the money being retained. And the two
hour delay means the bay stays held for two hours past the end time, which is
harmless because the interval has already passed.

### 7. The driver overstays

`check_out_booking` compares `now()` to `ends_at + GRACE_PERIOD_MINUTES`
(default 10). Inside grace: `overstay_minutes = 0`, `overstay_amount_paise = 0`,
`overstay_settled = true`. Outside grace: minutes counted from the **original
end time**, rounded up to whole hours, at the hourly rate (or
`price_daily_paise / 24` when no hourly rate exists) times `OVERSTAY_MULTIPLIER`
(default 1.5), with `overstay_settled = false`.

If the driver never checks out at all,
`auto_complete_stale_bookings` completes the booking six hours after `ends_at`
and back-dates `checked_out_at` to `coalesce(checked_out_at, ends_at)`, which
means **no overstay is charged on that path**. A driver who overstays and simply
does not press the button is billed nothing. That is a real gap.

In either case the bay is released for the period after `ends_at` by the range
itself, so the next booking is unaffected. An overstaying car physically blocking
the next driver is a dispute, not a scheduling problem, and the `disputes` table
carries `vehicle_blocked` for exactly that.

### 8. The extension is blocked by the next booking

`extend_booking` probes for any live booking on **the same bay** overlapping
`[current ends_at, new_ends_at)`. If one exists it returns `EXTENSION_BLOCKED`,
mapped to HTTP 409 with "The space is booked straight after you, so it cannot be
extended."

Nothing is charged and nothing changes. `extension_count` is not incremented on a
blocked attempt, so a driver can try a shorter extension immediately. The same
error covers a host blackout in the tail, and the `exclusion_violation` handler
covers the race where the next booking commits between the probe and the update.

What the driver should do instead is book a new slot on any free bay. The engine
does not do this automatically, and it arguably should.

### 9. The user double-clicks Pay

Three layers, at three levels:

1. **`idempotencyKeyRef`** in the checkout client is a `useRef` initialised once
   per page load with `crypto.randomUUID()`. Both clicks send the same key.
2. **`payments.idempotency_key` is unique.** The second insert raises `23505`,
   which the route treats as the retry case working correctly, logs nothing, and
   still returns the intent. One payment row exists, not two.
3. **Razorpay's `receipt`** is set to the same key, and Razorpay treats a
   repeated receipt as the same order, so the gateway does not create a second
   order either.

For the booking creation step, `POST /api/bookings` performs its own lookup
before calling the RPC: an existing `pending` or `confirmed` booking by the same
driver, for the same space and the exact same `starts_at`/`ends_at`, created in
the last hour, is returned with `idempotent: true`. That window comfortably
covers a user retrying a failed payment without resurrecting a booking they made
yesterday.

### 10. The hold expires while the payment sheet is open

The countdown in the browser reaches zero and the page replaces the Pay button
with "Your hold has run out. We released the space so somebody else could book
it, and you have not been charged."

Server side, two things could be true:

- **The webhook has not yet fired.** The sweeper may expire the row on its next
  five-minute pass, provided no payment is `captured` or `authorized`.
- **The webhook fires afterwards.** `confirm_booking` applies the lapsed-hold
  rule: confirm anyway if the bay is still free, otherwise
  `HOLD_EXPIRED_AND_TAKEN` and case 2 applies.

The important property is that the client's countdown is presentational. The
authoritative decision is made in `confirm_booking` against the real state of the
bay, not against a timer in a browser tab.

### 11. The gateway declines, then the user retries

`handleFailedPayment` marks the payment row `failed` with the provider's
`failure_code` and `failure_reason`, and **deliberately leaves the hold alone**:

```ts
// The hold is deliberately left alone. The driver may retry with another
// method, and releasing the bay the instant a card is declined would mean
// losing the space while reaching for a second card.
```

The booking stays `pending`, the bay stays held, the countdown keeps running. The
UI shows "The payment was declined. Your space is still held, so you can try
again."

A retry calls `POST /api/payments/create` again. If the client reuses the same
`idempotency_key` the insert collides and no new payment row is created, but a
new provider order **is** created and returned, so the webhook will match the
older `payments` row by `provider_order_id`, which will not match the new order
id. The reliable path, and what the checkout client does, is to reuse the intent
it already holds. This is a sharp edge: a retry after a decline works best when
it reuses the existing order rather than requesting a new one.

If the driver gives up, the sweeper expires the hold at the normal time and
releases the bay.

### 12. The webhook reports the wrong amount

```ts
if (event.amount != null && event.amount !== payment.amount_paise) {
  throw new Error(`Amount mismatch on ${event.providerOrderId}: gateway says
    ${event.amount}, booking says ${payment.amount_paise}. Not confirming.
    Needs manual reconciliation.`);
}
```

The check runs **before** the payment row is updated and before
`confirm_booking` is called, so a mismatched event confirms nothing and marks
nothing captured. The error goes to `webhook_events.processing_error` and the
endpoint answers 200, because retrying will not change the amount.

Both sides are integers in paise and both providers work natively in paise, so
there is no unit conversion anywhere on this path and therefore no rounding to
disagree about. The comparison is exact equality.

### 13. The driver tries to book their own space

`create_booking_hold` checks `s.host_id = v_user` and returns
`CANNOT_BOOK_OWN_SPACE`, HTTP 409, before any inventory is touched. This matters
beyond tidiness: a host booking their own space would inflate `booking_count`,
feed `popularity_score`, and give them a completed booking to review themselves
against. The `reviews_no_self_review` check would catch the review, but the
ranking manipulation would already have happened.

### 14. The vehicle does not fit

Three separate checks, each with its own error code, all before the insert:

| Check | Error |
| --- | --- |
| `vehicle.owner_id = auth.uid()` | `VEHICLE_NOT_YOURS`, 403 |
| Any of height, length or width exceeds the space limit, comparing only where both values are non-null | `VEHICLE_DOES_NOT_FIT`, 409 |
| `vehicle.vehicle_type` is not in `space.vehicle_types` | `VEHICLE_TYPE_NOT_ACCEPTED`, 409 |

The null-tolerant comparison matters: a space that states no height limit accepts
any height, and a vehicle with no recorded height is not blocked by a space that
does state one. The listing wizard makes `max_height_mm` mandatory for covered,
basement, garage and stack spaces precisely because an unstated height limit is
the single most common cause of a driver arriving and being unable to park.

`vehicle_id` is optional throughout. A booking with no vehicle skips all three
checks.

### 15. The driver cancels while still on the payment screen

Status is `pending`, which `cancel_booking` accepts. `compute_refund_paise` runs
the normal policy, but since nothing was captured the `refunds` insert selects
from `payments where status = 'captured'` and finds no row, so no refund row is
created. The booking moves to `cancelled` and, crucially, drops out of the
exclusion constraint, so the bay is released immediately rather than waiting for
the sweeper.

### 16. Check-in attempted too early

`now() < starts_at - interval '30 minutes'` returns `TOO_EARLY` with
`opens_at` in the payload. The error catalogue marks it `retryable: true`, the
only conflict-class error that is, because waiting genuinely fixes it.

### 17. Two extensions race for the same tail

Both pass the `exists` probe, both attempt the update. The one that commits
second trips `bookings_no_overlap` through the `UPDATE`, because changing
`ends_at` changes the generated `period` and the constraint is re-evaluated. The
`exception when exclusion_violation` handler returns `EXTENSION_BLOCKED`. The
same constraint that protects inserts protects updates, at no extra cost.
