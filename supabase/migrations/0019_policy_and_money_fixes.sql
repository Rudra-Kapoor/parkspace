-- =============================================================================
-- ParkSpace 0019 — policy holes and money bugs from the audit
-- =============================================================================
-- Seven findings, grouped because they share a root cause: a policy that scopes
-- rows but not columns, or an arithmetic path that was never exercised.
-- =============================================================================

-- =============================================================================
-- 1. A host could rewrite the review written about them
-- =============================================================================
-- reviews_subject_respond exists so a host can add a public reply. It was
-- written as a whole-row UPDATE policy scoped by subject_id, and Postgres
-- policies gate rows, not columns. So the host could also rewrite the rating and
-- the comment text of the review about them.
--
-- A marketplace where the reviewed party can edit the review has no reviews.
create or replace function reviews_guard_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed text[];
  touched text[];
begin
  if is_admin() or is_privileged_connection() then
    return new;
  end if;

  if auth.uid() = old.author_id then
    -- The author may revise their own review, but only while it is unpublished.
    -- Once it is public, editing it after seeing the counterparty's review is
    -- exactly the retaliation the blind window exists to prevent.
    if old.is_published then
      raise exception 'A published review cannot be edited'
        using errcode = 'insufficient_privilege';
    end if;
    allowed := array[
      'rating', 'rating_accuracy', 'rating_safety', 'rating_cleanliness',
      'rating_accessibility', 'rating_value', 'comment', 'updated_at'
    ];
  elsif auth.uid() = old.subject_id then
    -- The subject may only add a reply. Nothing else.
    allowed := array['host_response', 'host_responded_at', 'updated_at'];
  else
    raise exception 'Not your review to change'
      using errcode = 'insufficient_privilege';
  end if;

  select array_agg(n.key order by n.key)
    into touched
    from jsonb_each(to_jsonb(new)) n
   where n.value is distinct from (to_jsonb(old) -> n.key)
     and n.key <> all(allowed);

  if touched is not null then
    raise exception 'Refused changes to: %', array_to_string(touched, ', ')
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

drop trigger if exists reviews_guard on reviews;
create trigger reviews_guard
  before update on reviews
  for each row execute function reviews_guard_columns();

-- A review must also be inserted honestly. The insert policy already checks the
-- booking and the direction; this stops a driver setting is_published to skip
-- the blind window, or forging the host's reply at insert time.
create or replace function reviews_guard_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if is_admin() or is_privileged_connection() then
    return new;
  end if;

  -- Publication is decided by the pairing trigger or the scheduled job, never
  -- by the author.
  new.is_published    := false;
  new.published_at    := null;
  new.host_response   := null;
  new.host_responded_at := null;
  new.is_flagged      := false;
  new.is_hidden       := false;

  return new;
end;
$$;

drop trigger if exists reviews_guard_new on reviews;
create trigger reviews_guard_new
  before insert on reviews
  for each row execute function reviews_guard_insert();

-- =============================================================================
-- 2. A message recipient could rewrite the message sent to them
-- =============================================================================
-- messages_mark_read was written with `with check (true)` so that a recipient
-- could stamp read_at. That permits rewriting the body and the sender too,
-- which turns the dispute evidence trail into fiction.
create or replace function messages_guard_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  touched text[];
begin
  if is_admin() or is_privileged_connection() then
    return new;
  end if;

  select array_agg(n.key order by n.key)
    into touched
    from jsonb_each(to_jsonb(new)) n
   where n.value is distinct from (to_jsonb(old) -> n.key)
     and n.key <> 'read_at';

  if touched is not null then
    raise exception 'Only read_at may be changed on a message. Refused: %',
      array_to_string(touched, ', ')
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

drop trigger if exists messages_guard on messages;
create trigger messages_guard
  before update on messages
  for each row execute function messages_guard_update();

-- =============================================================================
-- 3. The whole user directory was public
-- =============================================================================
-- public_profiles is granted to anon and its WHERE clause only excluded
-- suspended accounts, so an unauthenticated client could page through every
-- user's real name and join date. A name is not a catastrophe on its own, but a
-- complete, enumerable directory of a city's drivers and homeowners is a
-- different thing, and nothing in the product needs it.
--
-- The view stays, because host cards and review authors legitimately use it.
-- anon loses the ability to enumerate: it must now name an id it already has.
revoke select on public_profiles from anon;
grant select on public_profiles to authenticated;

-- A host card on a public listing page still needs to render for a signed-out
-- visitor, so expose exactly that through a function which takes one id and
-- returns one row.
create or replace function public_host_card(p_user_id uuid)
returns table (
  id uuid,
  full_name text,
  avatar_url text,
  member_since timestamptz,
  is_verified boolean,
  is_superhost boolean,
  host_display_name text,
  avg_response_minutes integer
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.full_name, p.avatar_url, p.created_at,
         (p.verification = 'verified'), coalesce(hp.is_superhost, false),
         hp.display_name, hp.avg_response_minutes
    from profiles p
    left join host_profiles hp on hp.user_id = p.id
   where p.id = p_user_id
     and not p.is_suspended
     -- Only somebody who actually hosts a live listing is publicly visible.
     and exists (
       select 1 from parking_spaces ps
        where ps.host_id = p.id and ps.status = 'active'
     );
$$;

grant execute on function public_host_card(uuid) to anon, authenticated;

-- =============================================================================
-- 4. Every active coupon code was published to the internet
-- =============================================================================
-- coupons_public_read let any visitor list every active code, including
-- new-user-only and targeted campaigns. Codes are validated server side, so
-- nothing was forgeable, but a targeted discount that anyone can read is not a
-- targeted discount.
drop policy if exists coupons_public_read on coupons;

create policy coupons_admin_read on coupons
  for select using (is_admin());

-- Validation happens inside quote_booking, which is SECURITY DEFINER and reads
-- the table with its own rights, so redeeming a code still works without any
-- client ever being able to list them.

-- =============================================================================
-- 5. A dispute released the bay and stranded the booking
-- =============================================================================
-- The exclusion constraint covers pending, confirmed and active. Raising a
-- dispute moves a booking to 'disputed', which is outside that set, so the bay
-- became immediately resellable underneath a driver who was still parked in it.
-- The state machine also has no transition out of 'disputed' back to 'active'.
--
-- Two fixes. Include 'disputed' in the constraint, and let has_address_access
-- keep working for a disputed booking so the driver does not lose the gate code
-- in the middle of the argument they are having about it.
alter table bookings drop constraint if exists bookings_no_overlap;

alter table bookings
  add constraint bookings_no_overlap
  exclude using gist (
    space_id  with =,
    bay_index with =,
    period    with &&
  )
  where (status in ('pending', 'confirmed', 'active', 'disputed'));

create or replace function has_address_access(p_space_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from bookings b
     where b.space_id = p_space_id
       and b.driver_id = auth.uid()
       -- 'disputed' included deliberately: a driver arguing about a space is
       -- precisely the person who still needs to get their car out of it.
       and b.status in ('confirmed', 'active', 'completed', 'disputed')
       and now() >= b.starts_at - interval '24 hours'
  );
$$;

-- =============================================================================
-- 6. Host cancellation subtracted the wallet credit twice
-- =============================================================================
-- compute_refund_paise returned, for a host or platform cancellation:
--
--     refund_paise        = total_amount_paise - wallet_applied_paise
--     wallet_return_paise = wallet_applied_paise
--
-- But total_amount_paise ALREADY has the wallet credit deducted, by the
-- constraint bookings_total_is_consistent in 0004. So the driver was refunded
-- the wallet amount short in cash while also getting it back as credit: they
-- lost real money and gained credit, on a cancellation that was not their fault.
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
  net_paid bigint;
  refund bigint;
  forfeited bigint;
  platform_keeps bigint;
  host_keeps bigint;
  wallet_return bigint;
  cutoff_hours numeric;
  reason text;
begin
  select * into b from bookings where id = p_booking_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'BOOKING_NOT_FOUND');
  end if;

  hours_before := extract(epoch from (b.starts_at - now())) / 3600.0;
  net_paid := b.base_amount_paise - b.discount_amount_paise;

  -- ---------------------------------------------------------------------------
  -- Host or platform cancelled: the driver is made whole.
  --
  -- total_amount_paise is already net of the wallet credit, so it IS the cash
  -- the driver parted with. Refund exactly that, and return the credit
  -- separately. Subtracting the wallet amount again was the bug.
  -- ---------------------------------------------------------------------------
  if p_by in ('host', 'platform') then
    return jsonb_build_object(
      'ok', true,
      'refund_paise', b.total_amount_paise,
      'wallet_return_paise', b.wallet_applied_paise,
      'forfeited_paise', 0,
      'platform_keeps_paise', 0,
      'host_keeps_paise', 0,
      'service_fee_retained_paise', 0,
      'policy', b.cancellation_policy,
      'hours_before_start', round(hours_before, 2),
      'reason', 'full_refund_host_or_platform'
    );
  end if;

  if b.status = 'active' or b.checked_in_at is not null then
    forfeited := net_paid;
    platform_keeps := round(forfeited * b.commission_rate_bp / 10000.0);
    host_keeps := forfeited - platform_keeps;

    return jsonb_build_object(
      'ok', true,
      'refund_paise', 0,
      'wallet_return_paise', 0,
      'forfeited_paise', forfeited,
      'platform_keeps_paise', platform_keeps + b.service_fee_paise,
      'host_keeps_paise', host_keeps,
      'service_fee_retained_paise', b.service_fee_paise,
      'policy', b.cancellation_policy,
      'hours_before_start', round(hours_before, 2),
      'reason', 'already_checked_in'
    );
  end if;

  cutoff_hours := case b.cancellation_policy
    when 'flexible' then 1
    when 'moderate' then 24
    when 'strict'   then 48
    else null
  end;

  refund := case b.cancellation_policy
    when 'flexible' then case when hours_before >= 1 then net_paid else 0 end
    when 'moderate' then case when hours_before >= 24 then net_paid else net_paid / 2 end
    when 'strict'   then case when hours_before >= 48 then net_paid / 2 else 0 end
    when 'non_refundable' then 0
  end;

  reason := case
    when b.cancellation_policy = 'non_refundable' then 'non_refundable_policy'
    when cutoff_hours is not null and hours_before >= cutoff_hours then 'before_cutoff'
    else 'after_cutoff'
  end;

  forfeited := net_paid - refund;
  platform_keeps := round(forfeited * b.commission_rate_bp / 10000.0);
  host_keeps := forfeited - platform_keeps;

  wallet_return := case
    when net_paid = 0 then 0
    else least(b.wallet_applied_paise, round(b.wallet_applied_paise * refund::numeric / net_paid))
  end;

  refund := greatest(refund - wallet_return, 0);

  return jsonb_build_object(
    'ok', true,
    'refund_paise', refund,
    'wallet_return_paise', wallet_return,
    'forfeited_paise', forfeited,
    'platform_keeps_paise', platform_keeps + b.service_fee_paise,
    'host_keeps_paise', host_keeps,
    'service_fee_retained_paise', b.service_fee_paise,
    'policy', b.cancellation_policy,
    'cutoff_hours', cutoff_hours,
    'hours_before_start', round(hours_before, 2),
    'reason', reason
  );
end;
$$;

grant execute on function compute_refund_paise(uuid, cancelled_by_party) to authenticated;

-- =============================================================================
-- 7. Cancelling an unpaid hold credited the host and decremented a coupon
-- =============================================================================
-- cancel_booking credited host_profiles.payable_balance_paise for any forfeit,
-- and decremented coupons.redemption_count unconditionally. Both are wrong for a
-- booking that was never paid for: a pending hold has no money behind it, and
-- its coupon redemption was never recorded, because confirm_booking is what
-- records it.
--
-- So abandoning holds repeatedly credited a host real money that never existed,
-- and drove the coupon counter negative, freeing redemptions for everyone.
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
  v_by cancelled_by_party;
  calc jsonb;
  v_refund bigint;
  v_wallet_return bigint;
  v_host_keeps bigint;
  v_platform_keeps bigint;
  is_admin_user boolean;
  was_paid boolean;
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
    v_by := 'driver';
  elsif v_user = b.host_id then
    v_by := 'host';
  elsif is_admin_user then
    v_by := 'platform';
  else
    return jsonb_build_object('ok', false, 'error', 'NOT_AUTHORIZED');
  end if;

  if b.status not in ('pending', 'confirmed') then
    return jsonb_build_object('ok', false, 'error', 'NOT_CANCELLABLE', 'status', b.status);
  end if;

  -- Did any money actually change hands for this booking? Everything below
  -- depends on the answer, and a pending hold almost never has.
  select exists (
    select 1 from payments p
     where p.booking_id = b.id and p.status = 'captured'
  ) into was_paid;

  calc := compute_refund_paise(p_booking_id, v_by);
  v_refund         := coalesce((calc->>'refund_paise')::bigint, 0);
  v_wallet_return  := coalesce((calc->>'wallet_return_paise')::bigint, 0);
  v_host_keeps     := coalesce((calc->>'host_keeps_paise')::bigint, 0);
  v_platform_keeps := coalesce((calc->>'platform_keeps_paise')::bigint, 0);

  -- Nothing was paid, so nothing is forfeited, refunded or kept.
  if not was_paid then
    v_refund := 0;
    v_wallet_return := 0;
    v_host_keeps := 0;
    v_platform_keeps := 0;
  end if;

  update bookings
     set status = 'cancelled',
         cancelled_at = now(),
         cancelled_by = v_by,
         cancellation_reason = p_reason,
         refund_amount_paise = v_refund,
         host_payout_paise = v_host_keeps,
         host_commission_paise = case
           when was_paid then greatest(v_platform_keeps - service_fee_paise, 0)
           else 0
         end,
         hold_expires_at = null
   where id = p_booking_id;

  -- The wallet debit only happened at confirm time, so only return it if it did.
  if was_paid and v_wallet_return > 0 then
    insert into wallet_transactions (user_id, txn_type, amount_paise, reference_type, reference_id, note)
    values (b.driver_id, 'refund_credit', v_wallet_return, 'booking', b.id,
            'Wallet returned for cancelled booking ' || b.code);
  end if;

  if was_paid and v_host_keeps > 0 then
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
           coalesce(p_reason, 'Booking cancelled by ' || v_by::text),
           v_user, 'requested', v_host_keeps, v_platform_keeps
      from payments p
     where p.booking_id = b.id and p.status = 'captured'
     order by p.created_at desc
     limit 1;
  end if;

  -- Release the coupon only if it was actually redeemed, which happens in
  -- confirm_booking. Deleting a row that is not there and decrementing a counter
  -- that was never incremented is how a counter goes negative.
  if b.coupon_id is not null then
    if exists (select 1 from coupon_redemptions cr where cr.booking_id = b.id) then
      delete from coupon_redemptions where booking_id = b.id;
      update coupons set redemption_count = greatest(redemption_count - 1, 0)
       where id = b.coupon_id;
    end if;
  end if;

  insert into booking_events (booking_id, event_type, actor_id, metadata)
  values (p_booking_id, 'cancelled', v_user,
          jsonb_build_object('by', v_by, 'refund_paise', v_refund,
                             'was_paid', was_paid, 'split', calc));

  return jsonb_build_object(
    'ok', true,
    'refund_paise', v_refund,
    'wallet_return_paise', v_wallet_return,
    'was_paid', was_paid,
    'calc', calc
  );
end;
$$;

grant execute on function cancel_booking(uuid, text) to authenticated;
revoke execute on function cancel_booking(uuid, text) from public, anon;

-- =============================================================================
-- Assertions
-- =============================================================================
do $$
begin
  if has_table_privilege('anon', 'public.public_profiles', 'SELECT') then
    raise exception 'anon can still enumerate the user directory';
  end if;

  if (select count(*) from pg_policies where tablename = 'coupons' and policyname = 'coupons_public_read') > 0 then
    raise exception 'Coupon codes are still publicly listable';
  end if;

  if (select pg_get_constraintdef(oid) from pg_constraint where conname = 'bookings_no_overlap')
     not like '%disputed%' then
    raise exception 'A disputed booking no longer holds its bay';
  end if;

  raise notice 'Policy and money fixes applied.';
end;
$$;
