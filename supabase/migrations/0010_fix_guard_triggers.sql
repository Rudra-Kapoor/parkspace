-- =============================================================================
-- ParkSpace 0010 — fix two guard triggers that block legitimate writes
-- =============================================================================
-- Reviewing 0008 against the operations in 0007 and 0009 turned up two bugs that
-- would have surfaced the first time anyone used the product.
--
-- BUG 1: every booking operation was broken.
--
--   bookings_guard_direct_update refuses any status change unless the caller is
--   an admin. Its own comment claims it detects a legitimate call "by the absence
--   of the marker the RPCs set", but no marker was ever set. SECURITY DEFINER
--   changes the privileges a function runs with, it does not change auth.uid(),
--   so inside cancel_booking the guard still saw an ordinary driver and raised.
--
--   Result: cancel_booking, check_in_booking, check_out_booking, confirm_booking,
--   expire_stale_holds and auto_complete_stale_bookings would all have failed
--   with "Booking status may only be changed through a booking operation".
--
--   Fix: the marker now exists. Each operation sets a transaction-local setting,
--   and the guard honours it. Transaction-local matters: the setting is discarded
--   at commit or rollback, so it cannot leak into a later statement on a pooled
--   connection.
--
-- BUG 2: the service role could not administer anything.
--
--   profiles_guard_privileged_columns and its siblings pin privileged columns to
--   their old values unless is_full_admin() passes, and that function reads
--   auth.uid(). The service role carries no auth.uid(), so it failed the check,
--   and every privileged write it made was silently reverted rather than
--   rejected. The seed script appeared to succeed while quietly failing to make
--   anybody a host.
--
--   Fix: recognise a service-role or direct database connection explicitly.
--   Silently reverting a write is worse than refusing it, so the new guards are
--   also clearer about which path they took.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Recognising a privileged caller
-- -----------------------------------------------------------------------------

-- True for the Supabase service role, and for a direct database connection such
-- as the SQL editor or a migration, neither of which carries a JWT.
create or replace function is_privileged_connection()
returns boolean
language plpgsql
stable
as $$
declare
  claims text;
begin
  claims := current_setting('request.jwt.claims', true);

  -- No claims at all means this is not a PostgREST request: a migration, the SQL
  -- editor, or a direct psql connection. Those are already trusted.
  if claims is null or claims = '' then
    return true;
  end if;

  return coalesce((claims::jsonb ->> 'role'), '') = 'service_role';
exception
  when others then
    -- Malformed claims: fail closed.
    return false;
end;
$$;

-- The marker a booking operation sets on itself.
create or replace function begin_booking_operation()
returns void
language sql
volatile
as $$
  -- The third argument makes this transaction-local, so it is discarded at
  -- commit or rollback and cannot leak across a pooled connection.
  select set_config('parkspace.booking_operation', 'on', true);
$$;

create or replace function in_booking_operation()
returns boolean
language sql
stable
as $$
  select coalesce(current_setting('parkspace.booking_operation', true), '') = 'on';
$$;

-- -----------------------------------------------------------------------------
-- Fix 1: the bookings guard
-- -----------------------------------------------------------------------------
create or replace function bookings_guard_direct_update()
returns trigger
language plpgsql
as $$
begin
  -- A booking operation has already validated everything it is about to change.
  if in_booking_operation() or is_privileged_connection() or is_admin() then
    return new;
  end if;

  if new.status is distinct from old.status then
    raise exception 'Booking status may only be changed through a booking operation'
      using errcode = 'insufficient_privilege';
  end if;

  -- Money and timing are immutable from a client. Pinned rather than raised,
  -- because a client legitimately updates driver_notes on the same row and
  -- should not be punished for sending the whole object back.
  new.base_amount_paise     := old.base_amount_paise;
  new.discount_amount_paise := old.discount_amount_paise;
  new.wallet_applied_paise  := old.wallet_applied_paise;
  new.service_fee_paise     := old.service_fee_paise;
  new.tax_amount_paise      := old.tax_amount_paise;
  new.total_amount_paise    := old.total_amount_paise;
  new.host_commission_paise := old.host_commission_paise;
  new.host_payout_paise     := old.host_payout_paise;
  new.refund_amount_paise   := old.refund_amount_paise;
  new.overstay_amount_paise := old.overstay_amount_paise;
  new.starts_at             := old.starts_at;
  new.ends_at               := old.ends_at;
  new.bay_index             := old.bay_index;
  new.qr_token              := old.qr_token;
  new.checked_in_at         := old.checked_in_at;
  new.checked_out_at        := old.checked_out_at;
  new.commission_rate_bp    := old.commission_rate_bp;
  new.service_fee_rate_bp   := old.service_fee_rate_bp;
  new.tax_rate_bp           := old.tax_rate_bp;

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Fix 2: the column guards must not fight the service role
-- -----------------------------------------------------------------------------
create or replace function profiles_guard_privileged_columns()
returns trigger
language plpgsql
as $$
begin
  if is_privileged_connection() or is_full_admin() then
    return new;
  end if;

  new.role                 := old.role;
  new.roles                := old.roles;
  new.verification         := old.verification;
  new.trust_score          := old.trust_score;
  new.wallet_balance_paise := old.wallet_balance_paise;
  new.bookings_completed   := old.bookings_completed;
  new.bookings_cancelled   := old.bookings_cancelled;
  new.is_suspended         := old.is_suspended;
  new.suspended_reason     := old.suspended_reason;
  new.referral_code        := old.referral_code;
  new.referred_by          := old.referred_by;

  return new;
end;
$$;

create or replace function host_profiles_guard_columns()
returns trigger
language plpgsql
as $$
begin
  if is_privileged_connection() or is_full_admin() then
    return new;
  end if;

  new.kyc_status            := old.kyc_status;
  new.kyc_reviewed_at       := old.kyc_reviewed_at;
  new.kyc_reviewer_id       := old.kyc_reviewer_id;
  new.is_superhost          := old.is_superhost;
  new.superhost_since       := old.superhost_since;
  new.total_earnings_paise  := old.total_earnings_paise;
  new.payable_balance_paise := old.payable_balance_paise;
  new.response_rate_bp      := old.response_rate_bp;
  new.acceptance_rate_bp    := old.acceptance_rate_bp;

  return new;
end;
$$;

create or replace function spaces_guard_columns()
returns trigger
language plpgsql
as $$
begin
  if is_privileged_connection() or is_admin() then
    return new;
  end if;

  new.avg_rating       := old.avg_rating;
  new.review_count     := old.review_count;
  new.booking_count    := old.booking_count;
  new.popularity_score := old.popularity_score;
  new.reviewed_by      := old.reviewed_by;
  new.reviewed_at      := old.reviewed_at;
  new.rejection_reason := old.rejection_reason;

  if new.status = 'active' and old.status not in ('active', 'paused') then
    raise exception 'A listing must be approved by moderation before it can go live'
      using errcode = 'check_violation';
  end if;

  if new.status = 'rejected' and old.status <> 'rejected' then
    raise exception 'Only moderation may reject a listing'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Set the marker inside every booking operation
-- -----------------------------------------------------------------------------
-- Rather than rewriting each function body, wrap the marker into the places that
-- mutate a booking's status. Each function is recreated with a single added line
-- at the top. The bodies are otherwise unchanged from 0007 and 0009.
-- -----------------------------------------------------------------------------

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
  perform begin_booking_operation();

  select * into b from bookings where id = p_booking_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'BOOKING_NOT_FOUND');
  end if;

  if b.status = 'confirmed' then
    return jsonb_build_object('ok', true, 'already', true, 'booking_id', b.id);
  end if;

  if b.status <> 'pending' then
    return jsonb_build_object('ok', false, 'error', 'BOOKING_NOT_PENDING', 'status', b.status);
  end if;

  if b.hold_expires_at < now()
     and count_free_bays(b.space_id, b.starts_at, b.ends_at, b.id) <= 0 then
    return jsonb_build_object('ok', false, 'error', 'HOLD_EXPIRED_AND_TAKEN');
  end if;

  update bookings
     set status = 'confirmed',
         hold_expires_at = null
   where id = p_booking_id;

  if b.wallet_applied_paise > 0 then
    insert into wallet_transactions (user_id, txn_type, amount_paise, reference_type, reference_id, note)
    values (b.driver_id, 'booking_spend', -b.wallet_applied_paise, 'booking', b.id,
            'Applied to booking ' || b.code);
  end if;

  if b.coupon_id is not null then
    insert into coupon_redemptions (coupon_id, user_id, booking_id, discount_paise)
    values (b.coupon_id, b.driver_id, b.id, b.discount_amount_paise)
    on conflict (coupon_id, booking_id) do nothing;

    update coupons set redemption_count = redemption_count + 1 where id = b.coupon_id;
  end if;

  update referrals r
     set status = 'qualified', qualifying_booking_id = b.id
   where r.referee_id = b.driver_id and r.status = 'pending';

  insert into booking_events (booking_id, event_type, metadata)
  values (p_booking_id, 'payment_confirmed', jsonb_build_object('payment_id', p_payment_id));

  return jsonb_build_object('ok', true, 'booking_id', b.id, 'code', b.code);
end;
$$;

-- cancel_booking: identical to 0009 apart from the marker.
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
  v_host_keeps bigint;
  v_platform_keeps bigint;
  is_admin_user boolean;
begin
  perform begin_booking_operation();

  select * into b from bookings where id = p_booking_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'BOOKING_NOT_FOUND');
  end if;

  select exists (
    select 1 from profiles where id = v_user and role in ('admin','support')
  ) into is_admin_user;

  if v_user = b.driver_id then
    by := 'driver';
  elsif v_user = b.host_id then
    by := 'host';
  elsif is_admin_user then
    by := 'platform';
  else
    return jsonb_build_object('ok', false, 'error', 'NOT_AUTHORIZED');
  end if;

  if b.status not in ('pending', 'confirmed') then
    return jsonb_build_object('ok', false, 'error', 'NOT_CANCELLABLE', 'status', b.status);
  end if;

  calc := compute_refund_paise(p_booking_id, by);
  v_refund         := coalesce((calc->>'refund_paise')::bigint, 0);
  v_wallet_return  := coalesce((calc->>'wallet_return_paise')::bigint, 0);
  v_host_keeps     := coalesce((calc->>'host_keeps_paise')::bigint, 0);
  v_platform_keeps := coalesce((calc->>'platform_keeps_paise')::bigint, 0);

  update bookings
     set status = 'cancelled',
         cancelled_at = now(),
         cancelled_by = by,
         cancellation_reason = p_reason,
         refund_amount_paise = v_refund,
         host_payout_paise = v_host_keeps,
         host_commission_paise = greatest(v_platform_keeps - service_fee_paise, 0),
         hold_expires_at = null
   where id = p_booking_id;

  if v_wallet_return > 0 then
    insert into wallet_transactions (user_id, txn_type, amount_paise, reference_type, reference_id, note)
    values (b.driver_id, 'refund_credit', v_wallet_return, 'booking', b.id,
            'Wallet returned for cancelled booking ' || b.code);
  end if;

  if v_host_keeps > 0 then
    update host_profiles
       set total_earnings_paise  = total_earnings_paise + v_host_keeps,
           payable_balance_paise = payable_balance_paise + v_host_keeps
     where user_id = b.host_id;
  end if;

  if v_refund > 0 then
    insert into refunds (
      payment_id, booking_id, amount_paise, policy_applied, reason,
      requested_by, status, host_retained_paise, platform_retained_paise
    )
    select p.id, b.id, v_refund, b.cancellation_policy,
           coalesce(p_reason, 'Booking cancelled by ' || by::text),
           v_user, 'requested', v_host_keeps, v_platform_keeps
      from payments p
     where p.booking_id = b.id and p.status = 'captured'
     order by p.created_at desc
     limit 1;
  end if;

  if b.coupon_id is not null then
    delete from coupon_redemptions where booking_id = b.id;
    update coupons set redemption_count = greatest(redemption_count - 1, 0) where id = b.coupon_id;
  end if;

  insert into booking_events (booking_id, event_type, actor_id, metadata)
  values (p_booking_id, 'cancelled', v_user,
          jsonb_build_object('by', by, 'refund_paise', v_refund, 'split', calc));

  return jsonb_build_object(
    'ok', true,
    'refund_paise', v_refund,
    'wallet_return_paise', v_wallet_return,
    'calc', calc
  );
end;
$$;

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
  perform begin_booking_operation();

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
  values (p_booking_id, 'checked_in', v_user, jsonb_build_object('distance_m', dist));

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
  grace integer;
  over_minutes integer := 0;
  over_amount bigint := 0;
  hourly bigint;
  mult numeric;
begin
  perform begin_booking_operation();

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

-- extend_booking changes ends_at, which the guard also pins.
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
  perform begin_booking_operation();

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
  perform begin_booking_operation();

  with expired as (
    update bookings
       set status = 'expired', hold_expires_at = null
     where status = 'pending'
       and hold_expires_at is not null
       and hold_expires_at < now()
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
  perform begin_booking_operation();

  with done as (
    update bookings
       set status = 'completed',
           checked_out_at = coalesce(checked_out_at, ends_at)
     where status = 'active'
       and ends_at < now() - interval '6 hours'
    returning 1
  )
  select count(*) into n from done;

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
-- Grants, unchanged from 0008 but restated because the functions were replaced.
-- -----------------------------------------------------------------------------
grant execute on function cancel_booking(uuid, text) to authenticated;
grant execute on function check_in_booking(uuid, double precision, double precision) to authenticated;
grant execute on function check_out_booking(uuid) to authenticated;
grant execute on function extend_booking(uuid, timestamptz) to authenticated;

revoke execute on function confirm_booking(uuid, uuid) from anon, authenticated;
revoke execute on function expire_stale_holds() from anon, authenticated;
revoke execute on function auto_complete_stale_bookings() from anon, authenticated;

-- begin_booking_operation must never be callable by a client, or the guard could
-- be disarmed from outside. This is the whole point of the marker.
revoke execute on function begin_booking_operation() from anon, authenticated, public;

comment on function begin_booking_operation is
  'Sets a transaction-local marker that tells bookings_guard_direct_update this write comes from a validated booking operation. Deliberately not executable by any client role: if it were, the guard could be disarmed from outside.';
