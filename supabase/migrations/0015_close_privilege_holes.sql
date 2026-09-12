-- =============================================================================
-- ParkSpace 0015 — close two critical privilege holes
-- =============================================================================
-- Found by an adversarial audit of the deployed system, and both confirmed
-- against the live database before writing this.
--
-- =============================================================================
-- HOLE 1 (critical): every "revoke" on a privileged function was a no-op.
-- =============================================================================
-- Postgres grants EXECUTE on a newly created function to PUBLIC by default.
-- Revoking from a named role does not remove a grant held by PUBLIC, and both
-- anon and authenticated are members of PUBLIC. So this, which appears in three
-- migrations, removed nothing at all:
--
--     revoke execute on function confirm_booking(uuid, uuid) from anon, authenticated;
--
-- Verified on the live database: confirm_booking, expire_stale_holds,
-- auto_complete_stale_bookings, refresh_superhost_badges,
-- refresh_host_cancellation_windows and expire_stale_holds_for_space were ALL
-- callable by anon and by authenticated.
--
-- confirm_booking is the severe one. It is SECURITY DEFINER, it makes no
-- auth.uid() check of any kind, and PostgREST exposes it at
-- /rest/v1/rpc/confirm_booking. Any signed-in driver could place a hold, skip
-- the payment screen entirely, POST their own booking id to that endpoint, and
-- receive a confirmed booking. That also flips has_address_access() to true, so
-- it handed them the host's exact address, access instructions and gate PIN.
-- Free parking and a privacy breach through the same call.
--
-- The correct form appears exactly once in the repository, on
-- begin_booking_operation in 0010, which is why that one function was actually
-- protected. Every other revoke omitted the word `public`.
--
-- Fixed here three ways, because one of them will be forgotten again:
--   1. Revoke from public explicitly on every privileged function.
--   2. Change the default for the schema, so a future function is not exposed
--      the moment it is created.
--   3. Assert at the end of this migration, so a regression fails the deploy.
--
-- =============================================================================
-- HOLE 2 (critical): the booking guard was a deny-list, and it had gaps.
-- =============================================================================
-- bookings_participant_update permits a participant to UPDATE their own booking
-- row, and all column protection was delegated to a trigger that pinned a
-- hand-written list of columns. The list covered money and timing. It did not
-- cover space_id.
--
-- So a driver could confirm a cheap booking on their own terms and then repoint
-- it at any listing in the system:
--
--     update bookings set space_id = '<any other space>' where id = '<mine>';
--
-- has_address_access() matches on space_id, so the exact address, the access
-- instructions and the gate PIN of the target listing were then released to
-- them. The entire location privacy rule collapses to one UPDATE.
--
-- cancellation_policy was also unpinned, so a driver could rewrite a
-- non_refundable booking to flexible and take a full refund.
--
-- The real defect is the shape, not the missing entries. A deny-list has to be
-- updated every time a column is added, and the failure mode of forgetting is
-- silent and total. This replaces it with an allow-list: name the columns a
-- client may legitimately change, and reject any update that touches anything
-- else. Adding a column now fails safe.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Hole 1, part 1: revoke from PUBLIC, the grant that actually existed.
-- -----------------------------------------------------------------------------
revoke execute on function confirm_booking(uuid, uuid) from public, anon, authenticated;
revoke execute on function expire_stale_holds() from public, anon, authenticated;
revoke execute on function expire_stale_holds_for_space(uuid) from public, anon, authenticated;
revoke execute on function auto_complete_stale_bookings() from public, anon, authenticated;
revoke execute on function refresh_superhost_badges() from public, anon, authenticated;
revoke execute on function refresh_host_cancellation_windows() from public, anon, authenticated;
revoke execute on function begin_booking_operation() from public, anon, authenticated;
revoke execute on function recompute_trust_score(uuid) from public, anon, authenticated;
revoke execute on function is_privileged_connection() from public, anon, authenticated;
revoke execute on function in_booking_operation() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Hole 1, part 2: stop new functions being world-executable by default.
-- -----------------------------------------------------------------------------
-- From here on a function is private until somebody grants it, which is the
-- right default for a schema PostgREST publishes to the internet.
alter default privileges in schema public revoke execute on functions from public;

-- The functions clients legitimately need, restated explicitly. Everything not
-- on this list is now unreachable from a browser.
grant execute on function search_spaces(
  double precision, double precision, integer, timestamptz, timestamptz,
  vehicle_type, bigint, space_type[], text[], numeric, boolean, boolean,
  text, integer, integer
) to anon, authenticated;

grant execute on function quote_booking(uuid, timestamptz, timestamptz, text, boolean, uuid) to anon, authenticated;
grant execute on function price_quote_paise(uuid, timestamptz, timestamptz) to anon, authenticated;
grant execute on function is_space_available(uuid, timestamptz, timestamptz) to anon, authenticated;
grant execute on function count_free_bays(uuid, timestamptz, timestamptz, uuid) to anon, authenticated;
grant execute on function space_availability_calendar(uuid, date, date) to anon, authenticated;

grant execute on function create_booking_hold(uuid, timestamptz, timestamptz, uuid, text, boolean, text) to authenticated;
grant execute on function cancel_booking(uuid, text) to authenticated;
grant execute on function check_in_booking(uuid, double precision, double precision) to authenticated;
grant execute on function check_out_booking(uuid) to authenticated;
grant execute on function extend_booking(uuid, timestamptz) to authenticated;
grant execute on function compute_refund_paise(uuid, cancelled_by_party) to authenticated;

-- -----------------------------------------------------------------------------
-- Hole 1, part 3: defence in depth inside confirm_booking itself.
-- -----------------------------------------------------------------------------
-- The grant is the control. This is the second lock, because the one function
-- that turns an unpaid hold into a sold booking should not rely solely on a
-- privilege that has already been got wrong once.
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
  -- Only the service role or a direct database connection may confirm. A user
  -- JWT, however it reached this function, is refused.
  if not is_privileged_connection() then
    raise exception 'confirm_booking is not callable by a client'
      using errcode = 'insufficient_privilege';
  end if;

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

  perform begin_booking_operation();

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

revoke execute on function confirm_booking(uuid, uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Hole 2: turn the booking guard into an allow-list.
-- -----------------------------------------------------------------------------
create or replace function bookings_guard_direct_update()
returns trigger
language plpgsql
as $$
declare
  -- The ONLY columns a participant may change by writing to the row directly.
  -- Everything else moves through a booking operation, which validates it.
  --
  -- Deliberately an allow-list. The previous version named the columns a client
  -- may NOT change, which meant every new column was writable until somebody
  -- remembered to add it, and forgetting was silent. space_id was forgotten,
  -- and repointing a confirmed booking at another listing released that host's
  -- address, access instructions and gate PIN.
  allowed constant text[] := array['driver_notes', 'updated_at'];
  touched text[];
begin
  if in_booking_operation() or is_privileged_connection() or is_admin() then
    return new;
  end if;

  select array_agg(n.key order by n.key)
    into touched
    from jsonb_each(to_jsonb(new)) n
   where n.value is distinct from (to_jsonb(old) -> n.key)
     and n.key <> all(allowed);

  if touched is not null then
    raise exception
      'A booking may only be changed through a booking operation. Refused changes to: %',
      array_to_string(touched, ', ')
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Assertions. A regression fails the deploy rather than shipping quietly.
-- -----------------------------------------------------------------------------
do $$
declare
  exposed text;
begin
  -- No privileged function may be reachable from a browser role.
  select string_agg(p.proname, ', ' order by p.proname)
    into exposed
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in (
       'confirm_booking', 'expire_stale_holds', 'expire_stale_holds_for_space',
       'auto_complete_stale_bookings', 'refresh_superhost_badges',
       'refresh_host_cancellation_windows', 'begin_booking_operation',
       'recompute_trust_score'
     )
     and (has_function_privilege('anon', p.oid, 'EXECUTE')
          or has_function_privilege('authenticated', p.oid, 'EXECUTE'));

  if exposed is not null then
    raise exception
      'Privilege hole: these functions are still callable by a browser role: %', exposed;
  end if;

  -- And the ones clients DO need must still work, or the product is broken.
  if not has_function_privilege('anon', 'public.search_spaces(double precision,double precision,integer,timestamptz,timestamptz,vehicle_type,bigint,space_type[],text[],numeric,boolean,boolean,text,integer,integer)', 'EXECUTE') then
    raise exception 'search_spaces is no longer callable by anon, which breaks search';
  end if;

  if not has_function_privilege('authenticated', 'public.create_booking_hold(uuid,timestamptz,timestamptz,uuid,text,boolean,text)', 'EXECUTE') then
    raise exception 'create_booking_hold is no longer callable, which breaks booking';
  end if;

  raise notice 'Privilege holes closed. Privileged functions are private, client functions still reachable.';
end;
$$;
