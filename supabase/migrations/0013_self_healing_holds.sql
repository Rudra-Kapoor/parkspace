-- =============================================================================
-- ParkSpace 0013 — stop correctness depending on a scheduler
-- =============================================================================
-- Deploying to Vercel's Hobby plan surfaced a design weakness worth fixing
-- properly rather than working around.
--
-- Hobby allows a cron at most once per day. The sweeper that expires abandoned
-- payment holds was scheduled every five minutes, and the booking engine relied
-- on it: a hold participates in the exclusion constraint, so an abandoned one
-- kept its bay locked until the sweeper ran. On a daily schedule, one driver
-- who opened a payment screen and closed the tab would take a bay out of the
-- market for up to 24 hours.
--
-- The real problem is not the plan. It is that correctness depended on a
-- scheduler running on time, and a scheduler is the least reliable component in
-- any system. A missed cron should degrade tidiness, never availability.
--
-- So the sweep now happens where it actually matters: at the moment somebody
-- tries to book. create_booking_hold releases the expired holds on that one
-- space before it attempts its insert, which is a single indexed delete over a
-- handful of rows. Availability reads ignore expired holds too, so search
-- results are honest between sweeps.
--
-- The scheduled job still exists and still runs, now daily. It is housekeeping
-- rather than load-bearing.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Scoped sweep: release abandoned holds on ONE space
-- -----------------------------------------------------------------------------
create or replace function expire_stale_holds_for_space(p_space_id uuid)
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
     where space_id = p_space_id
       and status = 'pending'
       and hold_expires_at is not null
       and hold_expires_at < now()
       -- Never expire a hold that has money against it. That is a
       -- reconciliation problem for a human, not a row to discard quietly.
       and not exists (
         select 1 from payments p
          where p.booking_id = bookings.id
            and p.status in ('captured', 'authorized')
       )
    returning 1
  )
  select count(*) into n from expired;

  return n;
end;
$$;

revoke execute on function expire_stale_holds_for_space(uuid) from anon, authenticated;

comment on function expire_stale_holds_for_space is
  'Releases abandoned payment holds on one space. Called by create_booking_hold so that availability never waits on a scheduler.';

-- -----------------------------------------------------------------------------
-- Availability reads ignore holds that have already lapsed
-- -----------------------------------------------------------------------------
-- Between sweeps a lapsed hold still carries status 'pending'. Counting it as
-- occupied would show a space as full when it is free, which is the visible half
-- of the same bug.
create or replace function count_free_bays(
  p_space_id  uuid,
  p_starts_at timestamptz,
  p_ends_at   timestamptz,
  p_exclude_booking uuid default null
)
returns integer
language sql
stable
as $$
  select greatest(
    ps.capacity - (
      select count(distinct b.bay_index)
        from bookings b
       where b.space_id = p_space_id
         and b.status in ('pending', 'confirmed', 'active')
         -- A pending hold only counts while it is still live.
         and (b.status <> 'pending' or b.hold_expires_at is null or b.hold_expires_at > now())
         and b.period && tstzrange(p_starts_at, p_ends_at, '[)')
         and (p_exclude_booking is null or b.id <> p_exclude_booking)
    ),
    0
  )::integer
  from parking_spaces ps
  where ps.id = p_space_id;
$$;

create or replace function next_free_bay(
  p_space_id  uuid,
  p_starts_at timestamptz,
  p_ends_at   timestamptz
)
returns smallint
language sql
stable
as $$
  select gs::smallint
    from parking_spaces ps,
         generate_series(0, ps.capacity - 1) gs
   where ps.id = p_space_id
     and not exists (
       select 1 from bookings b
        where b.space_id = p_space_id
          and b.bay_index = gs
          and b.status in ('pending', 'confirmed', 'active')
          and (b.status <> 'pending' or b.hold_expires_at is null or b.hold_expires_at > now())
          and b.period && tstzrange(p_starts_at, p_ends_at, '[)')
     )
   order by gs
   limit 1;
$$;

grant execute on function count_free_bays(uuid, timestamptz, timestamptz, uuid) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- create_booking_hold sweeps before it books
-- -----------------------------------------------------------------------------
-- Identical to 0007 apart from the sweep on the second line of the body.
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

  -- Release anything abandoned on this space first, so a driver who closed a tab
  -- twenty minutes ago is not holding a bay the person in front of us wants.
  perform expire_stale_holds_for_space(p_space_id);

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
    -- 23P01 is the exclusion violation. Somebody committed for this bay
    -- microseconds earlier. This is the happy path of a lost race.
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

grant execute on function create_booking_hold(uuid, timestamptz, timestamptz, uuid, text, boolean, text)
  to authenticated;

comment on function create_booking_hold is
  'Reserves a bay. Sweeps abandoned holds on the target space first, so availability never waits on a scheduled job.';
