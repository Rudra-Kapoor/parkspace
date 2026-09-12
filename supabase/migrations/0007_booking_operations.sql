-- =============================================================================
-- ParkSpace 0007 — transactional booking operations
-- =============================================================================
-- Every operation that touches money and state at the same time lives here as a
-- single function. The application never issues a bare UPDATE against bookings
-- for these flows, because a partial failure between two round trips is exactly
-- how a driver ends up charged for a booking that does not exist.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- quote_booking — the price breakdown, with no side effects
-- -----------------------------------------------------------------------------
create or replace function quote_booking(
  p_space_id    uuid,
  p_starts_at   timestamptz,
  p_ends_at     timestamptz,
  p_coupon_code text default null,
  p_use_wallet  boolean default false,
  p_user_id     uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s                 parking_spaces%rowtype;
  v_user            uuid := coalesce(p_user_id, auth.uid());
  base              bigint;
  discount          bigint := 0;
  wallet_applied    bigint := 0;
  taxable           bigint;
  service_fee       bigint;
  tax               bigint;
  total             bigint;
  commission        bigint;
  host_payout       bigint;
  commission_bp     integer;
  service_bp        integer;
  tax_bp            integer;
  c                 coupons%rowtype;
  coupon_error      text := null;
  user_redemptions  integer := 0;
  wallet_balance    bigint := 0;
  available         boolean;
  free_bays         integer;
begin
  select * into s from parking_spaces where id = p_space_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'SPACE_NOT_FOUND');
  end if;

  if s.status <> 'active' then
    return jsonb_build_object('ok', false, 'error', 'SPACE_NOT_ACTIVE');
  end if;

  base := price_quote_paise(p_space_id, p_starts_at, p_ends_at);
  if base is null then
    return jsonb_build_object('ok', false, 'error', 'CANNOT_PRICE');
  end if;

  available := is_space_available(p_space_id, p_starts_at, p_ends_at);
  free_bays := count_free_bays(p_space_id, p_starts_at, p_ends_at);

  -- Rates are read once here and then frozen onto the booking row, so a later
  -- change to platform_settings cannot restate an existing booking.
  commission_bp := (setting_numeric('HOST_COMMISSION_PCT', 0.10) * 10000)::integer;
  service_bp    := (setting_numeric('DRIVER_SERVICE_FEE_PCT', 0.05) * 10000)::integer;
  tax_bp        := (setting_numeric('GST_PCT', 0.18) * 10000)::integer;

  -- ---------------------------------------------------------------------------
  -- Coupon
  -- ---------------------------------------------------------------------------
  if p_coupon_code is not null and length(trim(p_coupon_code)) > 0 then
    select * into c from coupons
     where upper(code) = upper(trim(p_coupon_code)) limit 1;

    if not found then
      coupon_error := 'COUPON_NOT_FOUND';
    elsif not c.is_active then
      coupon_error := 'COUPON_INACTIVE';
    elsif c.valid_from > now() then
      coupon_error := 'COUPON_NOT_STARTED';
    elsif c.valid_until is not null and c.valid_until < now() then
      coupon_error := 'COUPON_EXPIRED';
    elsif c.max_redemptions is not null and c.redemption_count >= c.max_redemptions then
      coupon_error := 'COUPON_EXHAUSTED';
    elsif base < c.min_booking_paise then
      coupon_error := 'COUPON_MIN_NOT_MET';
    elsif c.restricted_cities is not null and not (s.city = any(c.restricted_cities)) then
      coupon_error := 'COUPON_CITY_RESTRICTED';
    else
      if v_user is not null then
        select count(*) into user_redemptions
          from coupon_redemptions cr
         where cr.coupon_id = c.id and cr.user_id = v_user;

        if user_redemptions >= c.max_per_user then
          coupon_error := 'COUPON_ALREADY_USED';
        elsif c.first_booking_only and exists (
          select 1 from bookings b
           where b.driver_id = v_user and b.status in ('completed','active','confirmed')
        ) then
          coupon_error := 'COUPON_FIRST_BOOKING_ONLY';
        end if;
      end if;

      if coupon_error is null then
        discount := case
          when c.coupon_type = 'flat' then c.value
          else (base * c.value) / 10000
        end;

        if c.max_discount_paise is not null then
          discount := least(discount, c.max_discount_paise);
        end if;
        discount := least(discount, base);
      end if;
    end if;
  end if;

  taxable := base - discount;

  -- ---------------------------------------------------------------------------
  -- Wallet credit is applied after the coupon and before fees.
  -- ---------------------------------------------------------------------------
  if p_use_wallet and v_user is not null then
    select wallet_balance_paise into wallet_balance from profiles where id = v_user;
    wallet_applied := least(coalesce(wallet_balance, 0), taxable);
    taxable := taxable - wallet_applied;
  end if;

  service_fee := round(taxable * service_bp / 10000.0);
  tax         := round(service_fee * tax_bp / 10000.0);
  total       := taxable + service_fee + tax;

  -- Commission is charged on the pre-wallet taxable amount, because a wallet
  -- credit is the platform's cost, not the host's.
  commission  := round((base - discount) * commission_bp / 10000.0);
  host_payout := (base - discount) - commission;

  return jsonb_build_object(
    'ok', true,
    'available', available,
    'free_bays', free_bays,
    'currency', s.currency,
    'starts_at', p_starts_at,
    'ends_at', p_ends_at,
    'duration_minutes', ceil(extract(epoch from (p_ends_at - p_starts_at)) / 60.0),
    'base_amount_paise', base,
    'discount_amount_paise', discount,
    'wallet_applied_paise', wallet_applied,
    'taxable_amount_paise', taxable,
    'service_fee_paise', service_fee,
    'tax_amount_paise', tax,
    'total_amount_paise', total,
    'host_commission_paise', commission,
    'host_payout_paise', host_payout,
    'commission_rate_bp', commission_bp,
    'service_fee_rate_bp', service_bp,
    'tax_rate_bp', tax_bp,
    'coupon_code', case when coupon_error is null and discount > 0 then c.code else null end,
    'coupon_id', case when coupon_error is null and discount > 0 then c.id else null end,
    'coupon_error', coupon_error,
    'cancellation_policy', s.cancellation_policy
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- create_booking_hold — reserve the bay, then let the driver pay
-- -----------------------------------------------------------------------------
-- The hold is what makes the payment screen safe. Without it, two drivers can
-- both reach the gateway for the same bay and one of them is guaranteed to be
-- disappointed after their money has moved.
create or replace function create_booking_hold(
  p_space_id    uuid,
  p_starts_at   timestamptz,
  p_ends_at     timestamptz,
  p_vehicle_id  uuid default null,
  p_coupon_code text default null,
  p_use_wallet  boolean default false,
  p_notes       text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user      uuid := auth.uid();
  s           parking_spaces%rowtype;
  q           jsonb;
  bay         smallint;
  hold_mins   integer;
  new_id      uuid;
  new_code    text;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'NOT_AUTHENTICATED');
  end if;

  if exists (select 1 from profiles where id = v_user and is_suspended) then
    return jsonb_build_object('ok', false, 'error', 'ACCOUNT_SUSPENDED');
  end if;

  select * into s from parking_spaces where id = p_space_id;
  if not found or s.status <> 'active' then
    return jsonb_build_object('ok', false, 'error', 'SPACE_NOT_AVAILABLE');
  end if;

  if s.host_id = v_user then
    return jsonb_build_object('ok', false, 'error', 'CANNOT_BOOK_OWN_SPACE');
  end if;

  -- The vehicle must belong to the caller and must fit.
  if p_vehicle_id is not null then
    if not exists (select 1 from vehicles where id = p_vehicle_id and owner_id = v_user) then
      return jsonb_build_object('ok', false, 'error', 'VEHICLE_NOT_YOURS');
    end if;

    if exists (
      select 1 from vehicles v
       where v.id = p_vehicle_id
         and (
           (s.max_height_mm is not null and v.height_mm is not null and v.height_mm > s.max_height_mm)
           or (s.max_length_mm is not null and v.length_mm is not null and v.length_mm > s.max_length_mm)
           or (s.max_width_mm  is not null and v.width_mm  is not null and v.width_mm  > s.max_width_mm)
         )
    ) then
      return jsonb_build_object('ok', false, 'error', 'VEHICLE_DOES_NOT_FIT');
    end if;

    if not exists (
      select 1 from vehicles v
       where v.id = p_vehicle_id and v.vehicle_type = any(s.vehicle_types)
    ) then
      return jsonb_build_object('ok', false, 'error', 'VEHICLE_TYPE_NOT_ACCEPTED');
    end if;
  end if;

  if not is_space_available(p_space_id, p_starts_at, p_ends_at) then
    return jsonb_build_object('ok', false, 'error', 'SPACE_NO_LONGER_AVAILABLE');
  end if;

  bay := next_free_bay(p_space_id, p_starts_at, p_ends_at);
  if bay is null then
    return jsonb_build_object('ok', false, 'error', 'SPACE_NO_LONGER_AVAILABLE');
  end if;

  q := quote_booking(p_space_id, p_starts_at, p_ends_at, p_coupon_code, p_use_wallet, v_user);
  if not (q->>'ok')::boolean then
    return q;
  end if;

  hold_mins := setting_int('BOOKING_HOLD_MINUTES', 10);

  begin
    insert into bookings (
      space_id, driver_id, host_id, vehicle_id, bay_index,
      starts_at, ends_at, status, hold_expires_at,
      base_amount_paise, discount_amount_paise, wallet_applied_paise,
      service_fee_paise, tax_amount_paise, total_amount_paise,
      host_commission_paise, host_payout_paise,
      commission_rate_bp, service_fee_rate_bp, tax_rate_bp,
      coupon_code, coupon_id, cancellation_policy, currency,
      driver_notes, space_snapshot
    ) values (
      p_space_id, v_user, s.host_id, p_vehicle_id, bay,
      p_starts_at, p_ends_at, 'pending', now() + make_interval(mins => hold_mins),
      (q->>'base_amount_paise')::bigint,
      (q->>'discount_amount_paise')::bigint,
      (q->>'wallet_applied_paise')::bigint,
      (q->>'service_fee_paise')::bigint,
      (q->>'tax_amount_paise')::bigint,
      (q->>'total_amount_paise')::bigint,
      (q->>'host_commission_paise')::bigint,
      (q->>'host_payout_paise')::bigint,
      (q->>'commission_rate_bp')::integer,
      (q->>'service_fee_rate_bp')::integer,
      (q->>'tax_rate_bp')::integer,
      q->>'coupon_code',
      nullif(q->>'coupon_id','')::uuid,
      s.cancellation_policy,
      s.currency,
      p_notes,
      jsonb_build_object(
        'title', s.title,
        'locality', s.locality,
        'city', s.city,
        'space_type', s.space_type,
        'amenities', s.amenities,
        'rules', s.rules,
        'price_hourly_paise', s.price_hourly_paise,
        'price_daily_paise', s.price_daily_paise,
        'cancellation_policy', s.cancellation_policy,
        'captured_at', now()
      )
    )
    returning id, code into new_id, new_code;

  exception
    -- 23P01 is the exclusion violation from bookings_no_overlap. Someone else
    -- committed for this bay microseconds earlier. This is the happy path of a
    -- lost race, not an error worth alarming on.
    when exclusion_violation then
      return jsonb_build_object('ok', false, 'error', 'SPACE_NO_LONGER_AVAILABLE');
  end;

  return jsonb_build_object(
    'ok', true,
    'booking_id', new_id,
    'code', new_code,
    'bay_index', bay,
    'hold_expires_at', now() + make_interval(mins => hold_mins),
    'quote', q
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- confirm_booking — called only after a verified payment
-- -----------------------------------------------------------------------------
-- Deliberately not callable by an end user: the API route invokes it with the
-- service role after it has verified the gateway signature.
create or replace function confirm_booking(
  p_booking_id uuid,
  p_payment_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  b bookings%rowtype;
begin
  select * into b from bookings where id = p_booking_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'BOOKING_NOT_FOUND');
  end if;

  -- Idempotent: a webhook that arrives twice must not double-apply anything.
  if b.status = 'confirmed' then
    return jsonb_build_object('ok', true, 'already', true, 'booking_id', b.id);
  end if;

  if b.status <> 'pending' then
    return jsonb_build_object('ok', false, 'error', 'BOOKING_NOT_PENDING', 'status', b.status);
  end if;

  -- The hold may have lapsed while the gateway was thinking. The bay might still
  -- be free, in which case we honour the payment rather than punishing the driver
  -- for the gateway's latency.
  if b.hold_expires_at < now()
     and count_free_bays(b.space_id, b.starts_at, b.ends_at, b.id) <= 0 then
    return jsonb_build_object('ok', false, 'error', 'HOLD_EXPIRED_AND_TAKEN');
  end if;

  update bookings
     set status = 'confirmed',
         hold_expires_at = null
   where id = p_booking_id;

  -- Spend the wallet portion now that the booking is real.
  if b.wallet_applied_paise > 0 then
    insert into wallet_transactions (user_id, txn_type, amount_paise, reference_type, reference_id, note)
    values (b.driver_id, 'booking_spend', -b.wallet_applied_paise, 'booking', b.id,
            'Applied to booking ' || b.code);
  end if;

  -- Record the coupon redemption once the booking is confirmed, not at quote time.
  if b.coupon_id is not null then
    insert into coupon_redemptions (coupon_id, user_id, booking_id, discount_paise)
    values (b.coupon_id, b.driver_id, b.id, b.discount_amount_paise)
    on conflict (coupon_id, booking_id) do nothing;

    update coupons set redemption_count = redemption_count + 1 where id = b.coupon_id;
  end if;

  -- Qualify a pending referral on the driver's first confirmed booking.
  update referrals r
     set status = 'qualified', qualifying_booking_id = b.id
   where r.referee_id = b.driver_id and r.status = 'pending';

  insert into booking_events (booking_id, event_type, metadata)
  values (p_booking_id, 'payment_confirmed', jsonb_build_object('payment_id', p_payment_id));

  return jsonb_build_object('ok', true, 'booking_id', b.id, 'code', b.code);
end;
$$;

-- -----------------------------------------------------------------------------
-- compute_refund_paise — pure policy, no side effects
-- -----------------------------------------------------------------------------
create or replace function compute_refund_paise(
  p_booking_id uuid,
  p_by         cancelled_by_party
)
returns jsonb
language plpgsql
stable
as $$
declare
  b bookings%rowtype;
  hours_before numeric;
  refundable bigint;
  refund bigint;
  keep_fee boolean;
begin
  select * into b from bookings where id = p_booking_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'BOOKING_NOT_FOUND');
  end if;

  hours_before := extract(epoch from (b.starts_at - now())) / 3600.0;

  -- The amount actually charged to an instrument, wallet portion excluded because
  -- that is returned to the wallet separately.
  refundable := b.total_amount_paise;

  -- A host or platform cancellation is always made whole, fee included.
  if p_by in ('host', 'platform') then
    return jsonb_build_object(
      'ok', true, 'refund_paise', refundable,
      'policy', b.cancellation_policy, 'reason', 'full_refund_host_or_platform',
      'service_fee_retained', 0
    );
  end if;

  if b.status = 'active' or b.checked_in_at is not null then
    return jsonb_build_object('ok', true, 'refund_paise', 0,
      'policy', b.cancellation_policy, 'reason', 'already_checked_in',
      'service_fee_retained', b.service_fee_paise);
  end if;

  keep_fee := true;  -- driver-initiated cancellation retains the service fee

  refund := case b.cancellation_policy
    when 'flexible' then
      case when hours_before >= 1 then b.base_amount_paise - b.discount_amount_paise else 0 end
    when 'moderate' then
      case
        when hours_before >= 24 then b.base_amount_paise - b.discount_amount_paise
        when hours_before >= 0  then (b.base_amount_paise - b.discount_amount_paise) / 2
        else 0
      end
    when 'strict' then
      case when hours_before >= 48 then (b.base_amount_paise - b.discount_amount_paise) / 2 else 0 end
    when 'non_refundable' then 0
  end;

  -- The wallet portion never reached an instrument, so subtract it from the cash
  -- refund and return it to the wallet instead.
  refund := greatest(refund - b.wallet_applied_paise, 0);

  return jsonb_build_object(
    'ok', true,
    'refund_paise', refund,
    'wallet_return_paise', least(b.wallet_applied_paise,
      case b.cancellation_policy when 'non_refundable' then 0 else b.wallet_applied_paise end),
    'policy', b.cancellation_policy,
    'hours_before_start', round(hours_before, 2),
    'service_fee_retained', case when keep_fee then b.service_fee_paise else 0 end,
    'reason', 'policy_applied'
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- cancel_booking
-- -----------------------------------------------------------------------------
create or replace function cancel_booking(
  p_booking_id uuid,
  p_reason     text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  b bookings%rowtype;
  by cancelled_by_party;
  calc jsonb;
  v_refund bigint;
  v_wallet_return bigint;
  is_admin boolean;
begin
  select * into b from bookings where id = p_booking_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'BOOKING_NOT_FOUND');
  end if;

  select exists (
    select 1 from profiles where id = v_user and role in ('admin','support')
  ) into is_admin;

  if v_user = b.driver_id then
    by := 'driver';
  elsif v_user = b.host_id then
    by := 'host';
  elsif is_admin then
    by := 'platform';
  else
    return jsonb_build_object('ok', false, 'error', 'NOT_AUTHORIZED');
  end if;

  if b.status not in ('pending', 'confirmed') then
    return jsonb_build_object('ok', false, 'error', 'NOT_CANCELLABLE', 'status', b.status);
  end if;

  calc := compute_refund_paise(p_booking_id, by);
  v_refund := coalesce((calc->>'refund_paise')::bigint, 0);
  v_wallet_return := coalesce((calc->>'wallet_return_paise')::bigint, 0);

  update bookings
     set status = 'cancelled',
         cancelled_at = now(),
         cancelled_by = by,
         cancellation_reason = p_reason,
         refund_amount_paise = v_refund,
         hold_expires_at = null
   where id = p_booking_id;

  -- Return the wallet portion immediately. Cash refunds go through the gateway
  -- asynchronously and are tracked in the refunds table.
  if v_wallet_return > 0 then
    insert into wallet_transactions (user_id, txn_type, amount_paise, reference_type, reference_id, note)
    values (b.driver_id, 'refund_credit', v_wallet_return, 'booking', b.id,
            'Wallet returned for cancelled booking ' || b.code);
  end if;

  if v_refund > 0 then
    insert into refunds (payment_id, booking_id, amount_paise, policy_applied, reason, requested_by, status)
    select p.id, b.id, v_refund, b.cancellation_policy,
           coalesce(p_reason, 'Booking cancelled by ' || by::text), v_user, 'requested'
      from payments p
     where p.booking_id = b.id and p.status = 'captured'
     order by p.created_at desc
     limit 1;
  end if;

  -- Release the coupon so the driver can use it again.
  if b.coupon_id is not null then
    delete from coupon_redemptions where booking_id = b.id;
    update coupons set redemption_count = greatest(redemption_count - 1, 0) where id = b.coupon_id;
  end if;

  insert into booking_events (booking_id, event_type, actor_id, metadata)
  values (p_booking_id, 'cancelled', v_user,
          jsonb_build_object('by', by, 'refund_paise', v_refund, 'calc', calc));

  return jsonb_build_object('ok', true, 'refund_paise', v_refund,
                            'wallet_return_paise', v_wallet_return, 'calc', calc);
end;
$$;

-- -----------------------------------------------------------------------------
-- check_in / check_out
-- -----------------------------------------------------------------------------
create or replace function check_in_booking(
  p_booking_id uuid,
  p_lat double precision default null,
  p_lng double precision default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  b bookings%rowtype;
  s parking_spaces%rowtype;
  dist integer;
begin
  select * into b from bookings where id = p_booking_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'BOOKING_NOT_FOUND');
  end if;

  if v_user not in (b.driver_id, b.host_id) then
    return jsonb_build_object('ok', false, 'error', 'NOT_AUTHORIZED');
  end if;

  if b.status = 'active' then
    return jsonb_build_object('ok', true, 'already', true, 'checked_in_at', b.checked_in_at);
  end if;

  if b.status <> 'confirmed' then
    return jsonb_build_object('ok', false, 'error', 'NOT_CHECKINABLE', 'status', b.status);
  end if;

  -- A 30 minute early arrival window is generous on purpose. Traffic is real and
  -- a driver idling at a gate is a support ticket waiting to happen.
  if now() < b.starts_at - interval '30 minutes' then
    return jsonb_build_object('ok', false, 'error', 'TOO_EARLY',
                              'opens_at', b.starts_at - interval '30 minutes');
  end if;

  select * into s from parking_spaces where id = b.space_id;

  if p_lat is not null and p_lng is not null then
    dist := round(earth_distance_m(p_lat, p_lng, s.lat, s.lng))::integer;
  end if;

  update bookings
     set status = 'active',
         checked_in_at = now(),
         checkin_lat = p_lat,
         checkin_lng = p_lng,
         checkin_distance_m = dist
   where id = p_booking_id;

  insert into booking_events (booking_id, event_type, actor_id, metadata)
  values (p_booking_id, 'checked_in', v_user,
          jsonb_build_object('distance_m', dist));

  return jsonb_build_object('ok', true, 'checked_in_at', now(), 'distance_m', dist);
end;
$$;

create or replace function check_out_booking(
  p_booking_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  b bookings%rowtype;
  s parking_spaces%rowtype;
  grace integer;
  over_minutes integer := 0;
  over_amount bigint := 0;
  hourly bigint;
  mult numeric;
begin
  select * into b from bookings where id = p_booking_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'BOOKING_NOT_FOUND');
  end if;

  if v_user not in (b.driver_id, b.host_id) then
    return jsonb_build_object('ok', false, 'error', 'NOT_AUTHORIZED');
  end if;

  if b.status = 'completed' then
    return jsonb_build_object('ok', true, 'already', true);
  end if;

  if b.status <> 'active' then
    return jsonb_build_object('ok', false, 'error', 'NOT_CHECKED_IN', 'status', b.status);
  end if;

  grace := setting_int('GRACE_PERIOD_MINUTES', 10);
  mult  := setting_numeric('OVERSTAY_MULTIPLIER', 1.5);

  if now() > b.ends_at + make_interval(mins => grace) then
    over_minutes := ceil(extract(epoch from (now() - b.ends_at)) / 60.0)::integer;

    select coalesce(price_hourly_paise, price_daily_paise / 24) into hourly
      from parking_spaces where id = b.space_id;

    over_amount := round(ceil(over_minutes / 60.0) * coalesce(hourly, 0) * mult);
  end if;

  select * into s from parking_spaces where id = b.space_id;

  update bookings
     set status = 'completed',
         checked_out_at = now(),
         overstay_minutes = over_minutes,
         overstay_amount_paise = over_amount,
         overstay_settled = (over_amount = 0)
   where id = p_booking_id;

  insert into booking_events (booking_id, event_type, actor_id, metadata)
  values (p_booking_id, 'checked_out', v_user,
          jsonb_build_object('overstay_minutes', over_minutes, 'overstay_paise', over_amount));

  return jsonb_build_object('ok', true, 'checked_out_at', now(),
                            'overstay_minutes', over_minutes,
                            'overstay_amount_paise', over_amount);
end;
$$;

-- -----------------------------------------------------------------------------
-- extend_booking — the most requested feature in every parking product
-- -----------------------------------------------------------------------------
create or replace function extend_booking(
  p_booking_id uuid,
  p_new_ends_at timestamptz
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  b bookings%rowtype;
  extra_base bigint;
  max_ext integer;
begin
  select * into b from bookings where id = p_booking_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'BOOKING_NOT_FOUND');
  end if;

  if v_user <> b.driver_id then
    return jsonb_build_object('ok', false, 'error', 'NOT_AUTHORIZED');
  end if;

  if b.status not in ('confirmed', 'active') then
    return jsonb_build_object('ok', false, 'error', 'NOT_EXTENDABLE', 'status', b.status);
  end if;

  if p_new_ends_at <= b.ends_at then
    return jsonb_build_object('ok', false, 'error', 'NOT_AN_EXTENSION');
  end if;

  max_ext := setting_int('MAX_EXTENSIONS', 3);
  if b.extension_count >= max_ext then
    return jsonb_build_object('ok', false, 'error', 'EXTENSION_LIMIT_REACHED');
  end if;

  -- Is the tail free on this very bay. Another booking may already own it.
  if exists (
    select 1 from bookings o
     where o.space_id = b.space_id
       and o.bay_index = b.bay_index
       and o.id <> b.id
       and o.status in ('pending','confirmed','active')
       and o.period && tstzrange(b.ends_at, p_new_ends_at, '[)')
  ) then
    return jsonb_build_object('ok', false, 'error', 'EXTENSION_BLOCKED');
  end if;

  if exists (
    select 1 from availability_blocks ab
     where ab.space_id = b.space_id
       and ab.period && tstzrange(b.ends_at, p_new_ends_at, '[)')
  ) then
    return jsonb_build_object('ok', false, 'error', 'EXTENSION_BLOCKED');
  end if;

  extra_base := price_quote_paise(b.space_id, b.ends_at, p_new_ends_at);

  begin
    update bookings
       set extended_from_ends_at = coalesce(extended_from_ends_at, ends_at),
           ends_at = p_new_ends_at,
           extension_count = extension_count + 1,
           base_amount_paise = base_amount_paise + extra_base,
           service_fee_paise = service_fee_paise
                               + round(extra_base * service_fee_rate_bp / 10000.0),
           tax_amount_paise = tax_amount_paise
                              + round(round(extra_base * service_fee_rate_bp / 10000.0)
                                      * tax_rate_bp / 10000.0),
           total_amount_paise = total_amount_paise
                                + extra_base
                                + round(extra_base * service_fee_rate_bp / 10000.0)
                                + round(round(extra_base * service_fee_rate_bp / 10000.0)
                                        * tax_rate_bp / 10000.0),
           host_commission_paise = host_commission_paise
                                   + round(extra_base * commission_rate_bp / 10000.0),
           host_payout_paise = host_payout_paise
                               + extra_base - round(extra_base * commission_rate_bp / 10000.0)
     where id = p_booking_id;
  exception
    when exclusion_violation then
      return jsonb_build_object('ok', false, 'error', 'EXTENSION_BLOCKED');
  end;

  insert into booking_events (booking_id, event_type, actor_id, metadata)
  values (p_booking_id, 'extended', v_user,
          jsonb_build_object('new_ends_at', p_new_ends_at, 'extra_paise', extra_base));

  return jsonb_build_object('ok', true, 'new_ends_at', p_new_ends_at,
                            'additional_amount_paise', extra_base);
end;
$$;

-- -----------------------------------------------------------------------------
-- expire_stale_holds — the sweeper
-- -----------------------------------------------------------------------------
-- Run on a schedule. Releases bays whose payment never landed so the inventory
-- becomes sellable again.
create or replace function expire_stale_holds()
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  n integer;
begin
  with expired as (
    update bookings
       set status = 'expired', hold_expires_at = null
     where status = 'pending'
       and hold_expires_at is not null
       and hold_expires_at < now()
       -- Never expire a hold that has a captured payment against it. That is a
       -- reconciliation problem for a human, not a row to quietly discard.
       and not exists (
         select 1 from payments p
          where p.booking_id = bookings.id and p.status in ('captured','authorized')
       )
    returning 1
  )
  select count(*) into n from expired;
  return n;
end;
$$;

-- Auto-complete bookings whose end time has passed and which were never checked
-- out. Without this an active booking would hold its bay forever.
create or replace function auto_complete_stale_bookings()
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  n integer := 0;
  m integer := 0;
begin
  with done as (
    update bookings
       set status = 'completed',
           checked_out_at = coalesce(checked_out_at, ends_at)
     where status = 'active'
       and ends_at < now() - interval '6 hours'
    returning 1
  )
  select count(*) into n from done;

  -- A confirmed booking whose entire window elapsed without a check-in is a
  -- no-show. The host keeps the money under every policy.
  with missed as (
    update bookings
       set status = 'no_show'
     where status = 'confirmed'
       and ends_at < now() - interval '2 hours'
       and checked_in_at is null
    returning 1
  )
  select count(*) into m from missed;

  return n + m;
end;
$$;

-- -----------------------------------------------------------------------------
-- Superhost recalculation
-- -----------------------------------------------------------------------------
create or replace function refresh_superhost_badges()
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  min_rating numeric := setting_numeric('SUPERHOST_MIN_RATING', 4.7);
  min_bookings integer := setting_int('SUPERHOST_MIN_BOOKINGS', 10);
  n integer;
begin
  with stats as (
    select
      ps.host_id,
      count(*) filter (where b.status = 'completed') as completed,
      count(*) filter (where b.status = 'cancelled' and b.cancelled_by = 'host') as host_cancels,
      avg(r.rating) as rating
    from parking_spaces ps
    left join bookings b on b.space_id = ps.id and b.created_at > now() - interval '365 days'
    left join reviews r on r.space_id = ps.id and r.direction = 'driver_to_host' and r.is_published
    group by ps.host_id
  ),
  updated as (
    update host_profiles hp
       set is_superhost = (
             s.completed >= min_bookings
             and coalesce(s.rating, 0) >= min_rating
             and coalesce(s.host_cancels, 0) <= 1
           ),
           superhost_since = case
             when (s.completed >= min_bookings
                   and coalesce(s.rating, 0) >= min_rating
                   and coalesce(s.host_cancels, 0) <= 1)
                  and not hp.is_superhost
             then now()
             when not (s.completed >= min_bookings
                       and coalesce(s.rating, 0) >= min_rating
                       and coalesce(s.host_cancels, 0) <= 1)
             then null
             else hp.superhost_since
           end
      from stats s
     where hp.user_id = s.host_id
    returning 1
  )
  select count(*) into n from updated;
  return n;
end;
$$;

-- -----------------------------------------------------------------------------
-- Trust score
-- -----------------------------------------------------------------------------
create or replace function recompute_trust_score(p_user_id uuid)
returns smallint
language plpgsql
volatile
as $$
declare
  completed integer;
  cancelled integer;
  disputes_lost integer;
  avg_rating numeric;
  verified boolean;
  score numeric := 50;
begin
  select bookings_completed, bookings_cancelled, verification = 'verified'
    into completed, cancelled, verified
    from profiles where id = p_user_id;

  select avg(rating) into avg_rating
    from reviews where subject_id = p_user_id and is_published and not is_hidden;

  select count(*) into disputes_lost
    from disputes d
    join bookings b on b.id = d.booking_id
   where (b.driver_id = p_user_id and d.status = 'resolved_host')
      or (b.host_id = p_user_id and d.status = 'resolved_driver');

  score := 50
    + least(coalesce(completed, 0) * 1.5, 25)
    + (coalesce(avg_rating, 3.5) - 3.5) * 10
    + (case when verified then 10 else 0 end)
    - least(coalesce(cancelled, 0) * 2.0, 20)
    - coalesce(disputes_lost, 0) * 5;

  score := greatest(least(score, 100), 0);

  update profiles set trust_score = score::smallint where id = p_user_id;
  return score::smallint;
end;
$$;
