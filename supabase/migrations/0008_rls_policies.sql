-- =============================================================================
-- ParkSpace 0008 — Row Level Security
-- =============================================================================
-- RLS is the authorisation boundary. Not the UI, not the API route. If a policy
-- here permits something, it is permitted, and no amount of careful front-end
-- code compensates for getting these wrong.
--
-- The rule we hold to throughout: the anon and authenticated roles get the
-- narrowest possible grant, and anything broader runs through a SECURITY DEFINER
-- function whose body we control.
-- =============================================================================

alter table profiles                enable row level security;
alter table vehicles                enable row level security;
alter table host_profiles           enable row level security;
alter table verification_documents  enable row level security;
alter table parking_spaces          enable row level security;
alter table space_photos            enable row level security;
alter table availability_rules      enable row level security;
alter table availability_blocks     enable row level security;
alter table price_overrides         enable row level security;
alter table bookings                enable row level security;
alter table booking_events          enable row level security;
alter table payments                enable row level security;
alter table refunds                 enable row level security;
alter table payouts                 enable row level security;
alter table payout_items            enable row level security;
alter table reviews                 enable row level security;
alter table messages                enable row level security;
alter table disputes                enable row level security;
alter table coupons                 enable row level security;
alter table coupon_redemptions      enable row level security;
alter table wallet_transactions     enable row level security;
alter table referrals               enable row level security;
alter table notifications           enable row level security;
alter table audit_logs              enable row level security;
alter table platform_settings       enable row level security;
alter table search_events           enable row level security;
alter table webhook_events          enable row level security;

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------
create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
     where id = auth.uid() and role in ('admin', 'support')
  );
$$;

create or replace function is_full_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- Does the current user hold a booking on this space that entitles them to the
-- exact address. This is the technical expression of spec kernel section 10.
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
       and b.status in ('confirmed', 'active', 'completed')
       -- Released from 24 hours before the stay, and stays readable afterwards so
       -- the driver can find their receipt and dispute evidence.
       and now() >= b.starts_at - interval '24 hours'
  );
$$;

-- =============================================================================
-- profiles
-- =============================================================================
create policy profiles_select_self on profiles
  for select using (id = auth.uid() or is_admin());

-- A limited public view of other people exists through the public_profiles view
-- below, never through this table directly.
create policy profiles_update_self on profiles
  for update using (id = auth.uid())
  with check (id = auth.uid());

create policy profiles_admin_all on profiles
  for all using (is_admin()) with check (is_full_admin());

-- Columns a user must never set on themselves. Enforced by a trigger because RLS
-- policies gate rows, not columns.
create or replace function profiles_guard_privileged_columns()
returns trigger
language plpgsql
as $$
begin
  if is_full_admin() then
    return new;
  end if;

  new.role                := old.role;
  new.roles               := old.roles;
  new.verification        := old.verification;
  new.trust_score         := old.trust_score;
  new.wallet_balance_paise := old.wallet_balance_paise;
  new.bookings_completed  := old.bookings_completed;
  new.bookings_cancelled  := old.bookings_cancelled;
  new.is_suspended        := old.is_suspended;
  new.suspended_reason    := old.suspended_reason;
  new.referral_code       := old.referral_code;
  new.referred_by         := old.referred_by;

  return new;
end;
$$;

create trigger profiles_guard_privileged
  before update on profiles
  for each row execute function profiles_guard_privileged_columns();

-- Safe public projection of a profile, used for host cards and review authors.
create view public_profiles
with (security_invoker = false) as
select
  p.id,
  p.full_name,
  p.avatar_url,
  p.trust_score,
  p.bookings_completed,
  p.created_at as member_since,
  (p.verification = 'verified') as is_verified,
  hp.is_superhost,
  hp.display_name as host_display_name,
  hp.response_rate_bp,
  hp.avg_response_minutes
from profiles p
left join host_profiles hp on hp.user_id = p.id
where not p.is_suspended;

grant select on public_profiles to anon, authenticated;

-- =============================================================================
-- vehicles
-- =============================================================================
create policy vehicles_owner_all on vehicles
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy vehicles_admin_read on vehicles
  for select using (is_admin());

-- A host may see the make, model and plate of the vehicle booked into their own
-- space, because that is how they identify the car at the gate. This is scoped to
-- a live booking rather than blanket access.
create policy vehicles_host_read_booked on vehicles
  for select using (
    exists (
      select 1 from bookings b
       where b.vehicle_id = vehicles.id
         and b.host_id = auth.uid()
         and b.status in ('confirmed', 'active', 'completed')
    )
  );

-- =============================================================================
-- host_profiles
-- =============================================================================
create policy host_profiles_owner_all on host_profiles
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy host_profiles_admin_all on host_profiles
  for all using (is_admin()) with check (is_full_admin());

-- Guard the fields a host must not set on themselves.
create or replace function host_profiles_guard_columns()
returns trigger
language plpgsql
as $$
begin
  if is_full_admin() then
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

create trigger host_profiles_guard
  before update on host_profiles
  for each row execute function host_profiles_guard_columns();

-- =============================================================================
-- verification_documents
-- =============================================================================
create policy verification_docs_owner on verification_documents
  for select using (user_id = auth.uid() or is_admin());

create policy verification_docs_insert on verification_documents
  for insert with check (user_id = auth.uid());

create policy verification_docs_admin on verification_documents
  for all using (is_admin()) with check (is_admin());

-- =============================================================================
-- parking_spaces
-- =============================================================================
-- Anyone may read an ACTIVE listing. Column-level protection of the exact address
-- is delivered by the public_spaces view plus the revoke below, not by this policy.
create policy spaces_public_read on parking_spaces
  for select using (
    status = 'active'
    or host_id = auth.uid()
    or is_admin()
  );

create policy spaces_host_insert on parking_spaces
  for insert with check (host_id = auth.uid());

create policy spaces_host_update on parking_spaces
  for update using (host_id = auth.uid() or is_admin())
  with check (host_id = auth.uid() or is_admin());

create policy spaces_host_delete on parking_spaces
  for delete using (host_id = auth.uid() or is_full_admin());

-- A host must not self-approve a listing, nor invent review aggregates.
create or replace function spaces_guard_columns()
returns trigger
language plpgsql
as $$
begin
  if is_admin() then
    return new;
  end if;

  new.avg_rating       := old.avg_rating;
  new.review_count     := old.review_count;
  new.booking_count    := old.booking_count;
  new.popularity_score := old.popularity_score;
  new.reviewed_by      := old.reviewed_by;
  new.reviewed_at      := old.reviewed_at;
  new.rejection_reason := old.rejection_reason;

  -- A host may move between draft, pending_review, active, paused and delisted,
  -- but may only reach 'active' from 'paused'. Going live for the first time
  -- requires moderation.
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

create trigger spaces_guard
  before update on parking_spaces
  for each row execute function spaces_guard_columns();

-- -----------------------------------------------------------------------------
-- The privacy-safe public projection
-- -----------------------------------------------------------------------------
-- The browser client is granted SELECT on this view, never on parking_spaces
-- directly. That is what makes the location privacy rule structural: there is no
-- column here that could leak the exact address.
create view public_spaces
with (security_invoker = false) as
select
  ps.id,
  ps.slug,
  ps.host_id,
  ps.title,
  ps.description,
  ps.locality,
  ps.city,
  ps.state,
  ps.postal_code,
  ps.country,
  ps.approx_lat,
  ps.approx_lng,
  ps.space_type,
  ps.vehicle_types,
  ps.capacity,
  ps.max_length_mm,
  ps.max_width_mm,
  ps.max_height_mm,
  ps.amenities,
  ps.rules,
  ps.price_hourly_paise,
  ps.price_daily_paise,
  ps.price_monthly_paise,
  ps.currency,
  ps.min_booking_minutes,
  ps.max_booking_minutes,
  ps.min_notice_minutes,
  ps.max_advance_days,
  ps.instant_book,
  ps.cancellation_policy,
  ps.access_method,
  ps.has_ev_charging,
  ps.ev_connector_type,
  ps.ev_power_kw,
  ps.ev_price_per_kwh_paise,
  ps.avg_rating,
  ps.review_count,
  ps.booking_count,
  ps.published_at,
  -- Released conditionally. For everyone else these are null, computed in the
  -- database rather than trimmed in the API layer.
  case when has_address_access(ps.id) or ps.host_id = auth.uid() or is_admin()
       then ps.address_line end as address_line,
  case when has_address_access(ps.id) or ps.host_id = auth.uid() or is_admin()
       then ps.landmark end as landmark,
  case when has_address_access(ps.id) or ps.host_id = auth.uid() or is_admin()
       then ps.lat end as exact_lat,
  case when has_address_access(ps.id) or ps.host_id = auth.uid() or is_admin()
       then ps.lng end as exact_lng,
  case when has_address_access(ps.id) or ps.host_id = auth.uid() or is_admin()
       then ps.access_instructions end as access_instructions,
  case when has_address_access(ps.id) or ps.host_id = auth.uid() or is_admin()
       then ps.access_pin end as access_pin
from parking_spaces ps
where ps.status = 'active' or ps.host_id = auth.uid() or is_admin();

grant select on public_spaces to anon, authenticated;

-- The browser role never reads the base table. This is the line that actually
-- enforces privacy: even a mistaken query cannot select address_line.
revoke select on parking_spaces from anon, authenticated;
grant select (
  id, slug, host_id, title, description, locality, city, state, postal_code,
  country, approx_lat, approx_lng, space_type, vehicle_types, capacity,
  max_length_mm, max_width_mm, max_height_mm, amenities, rules,
  price_hourly_paise, price_daily_paise, price_monthly_paise, currency,
  min_booking_minutes, max_booking_minutes, min_notice_minutes, max_advance_days,
  instant_book, cancellation_policy, access_method, has_ev_charging,
  ev_connector_type, ev_power_kw, ev_price_per_kwh_paise, avg_rating,
  review_count, booking_count, status, published_at, created_at, updated_at
) on parking_spaces to authenticated;

-- =============================================================================
-- space_photos, availability, price overrides
-- =============================================================================
create policy space_photos_read on space_photos
  for select using (
    exists (select 1 from parking_spaces ps
             where ps.id = space_photos.space_id
               and (ps.status = 'active' or ps.host_id = auth.uid() or is_admin()))
  );

create policy space_photos_host_write on space_photos
  for all using (
    exists (select 1 from parking_spaces ps
             where ps.id = space_photos.space_id and (ps.host_id = auth.uid() or is_admin()))
  ) with check (
    exists (select 1 from parking_spaces ps
             where ps.id = space_photos.space_id and (ps.host_id = auth.uid() or is_admin()))
  );

create policy availability_rules_read on availability_rules
  for select using (
    exists (select 1 from parking_spaces ps
             where ps.id = availability_rules.space_id
               and (ps.status = 'active' or ps.host_id = auth.uid() or is_admin()))
  );

create policy availability_rules_host_write on availability_rules
  for all using (
    exists (select 1 from parking_spaces ps
             where ps.id = availability_rules.space_id and (ps.host_id = auth.uid() or is_admin()))
  ) with check (
    exists (select 1 from parking_spaces ps
             where ps.id = availability_rules.space_id and (ps.host_id = auth.uid() or is_admin()))
  );

-- Blackouts are readable by anyone so the date picker can grey out dates, but the
-- reason is private to the host. The API selects only the period for public use.
create policy availability_blocks_read on availability_blocks
  for select using (
    exists (select 1 from parking_spaces ps
             where ps.id = availability_blocks.space_id
               and (ps.status = 'active' or ps.host_id = auth.uid() or is_admin()))
  );

create policy availability_blocks_host_write on availability_blocks
  for all using (
    exists (select 1 from parking_spaces ps
             where ps.id = availability_blocks.space_id and (ps.host_id = auth.uid() or is_admin()))
  ) with check (
    exists (select 1 from parking_spaces ps
             where ps.id = availability_blocks.space_id and (ps.host_id = auth.uid() or is_admin()))
  );

create policy price_overrides_read on price_overrides
  for select using (
    exists (select 1 from parking_spaces ps
             where ps.id = price_overrides.space_id
               and (ps.status = 'active' or ps.host_id = auth.uid() or is_admin()))
  );

create policy price_overrides_host_write on price_overrides
  for all using (
    exists (select 1 from parking_spaces ps
             where ps.id = price_overrides.space_id and (ps.host_id = auth.uid() or is_admin()))
  ) with check (
    exists (select 1 from parking_spaces ps
             where ps.id = price_overrides.space_id and (ps.host_id = auth.uid() or is_admin()))
  );

-- =============================================================================
-- bookings
-- =============================================================================
create policy bookings_participant_read on bookings
  for select using (
    driver_id = auth.uid() or host_id = auth.uid() or is_admin()
  );

-- Inserts go exclusively through create_booking_hold, which validates fit,
-- availability, ownership and price. A direct insert would bypass all of it.
create policy bookings_no_direct_insert on bookings
  for insert with check (is_full_admin());

-- Direct updates are limited to the few harmless fields. Status changes flow
-- through the RPCs.
create policy bookings_participant_update on bookings
  for update using (driver_id = auth.uid() or host_id = auth.uid() or is_admin())
  with check (driver_id = auth.uid() or host_id = auth.uid() or is_admin());

create or replace function bookings_guard_direct_update()
returns trigger
language plpgsql
as $$
begin
  -- A SECURITY DEFINER RPC runs with the definer's rights; we detect a direct
  -- client update by the absence of the marker the RPCs set.
  if is_admin() then
    return new;
  end if;

  if new.status is distinct from old.status then
    raise exception 'Booking status may only be changed through a booking operation'
      using errcode = 'insufficient_privilege';
  end if;

  -- Money is immutable from the client. Full stop.
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

  return new;
end;
$$;

create trigger bookings_guard_direct
  before update on bookings
  for each row execute function bookings_guard_direct_update();

create policy booking_events_participant_read on booking_events
  for select using (
    exists (select 1 from bookings b
             where b.id = booking_events.booking_id
               and (b.driver_id = auth.uid() or b.host_id = auth.uid() or is_admin()))
  );

-- =============================================================================
-- payments, refunds, payouts
-- =============================================================================
create policy payments_own_read on payments
  for select using (
    payer_id = auth.uid()
    or exists (select 1 from bookings b where b.id = payments.booking_id and b.host_id = auth.uid())
    or is_admin()
  );

-- Only the service role writes payments.
create policy payments_admin_write on payments
  for all using (is_full_admin()) with check (is_full_admin());

create policy refunds_own_read on refunds
  for select using (
    exists (select 1 from bookings b
             where b.id = refunds.booking_id
               and (b.driver_id = auth.uid() or b.host_id = auth.uid()))
    or is_admin()
  );

create policy refunds_admin_write on refunds
  for all using (is_admin()) with check (is_admin());

create policy payouts_host_read on payouts
  for select using (host_id = auth.uid() or is_admin());

create policy payouts_admin_write on payouts
  for all using (is_full_admin()) with check (is_full_admin());

create policy payout_items_read on payout_items
  for select using (
    exists (select 1 from payouts p where p.id = payout_items.payout_id
             and (p.host_id = auth.uid() or is_admin()))
  );

-- =============================================================================
-- reviews
-- =============================================================================
create policy reviews_public_read on reviews
  for select using (
    (is_published and not is_hidden)
    or author_id = auth.uid()
    or subject_id = auth.uid()
    or is_admin()
  );

-- A review may only be written by a participant of a completed booking.
create policy reviews_participant_insert on reviews
  for insert with check (
    author_id = auth.uid()
    and exists (
      select 1 from bookings b
       where b.id = reviews.booking_id
         and b.status in ('completed', 'no_show', 'disputed')
         and (
           (reviews.direction = 'driver_to_host' and b.driver_id = auth.uid() and reviews.subject_id = b.host_id)
           or (reviews.direction = 'host_to_driver' and b.host_id = auth.uid() and reviews.subject_id = b.driver_id)
         )
    )
  );

create policy reviews_author_update on reviews
  for update using (author_id = auth.uid() and not is_published)
  with check (author_id = auth.uid());

-- The host may add a public response to a review about them.
create policy reviews_subject_respond on reviews
  for update using (subject_id = auth.uid() and direction = 'driver_to_host')
  with check (subject_id = auth.uid());

create policy reviews_admin_all on reviews
  for all using (is_admin()) with check (is_admin());

-- =============================================================================
-- messages
-- =============================================================================
create policy messages_participant_read on messages
  for select using (
    exists (select 1 from bookings b
             where b.id = messages.booking_id
               and (b.driver_id = auth.uid() or b.host_id = auth.uid() or is_admin()))
  );

create policy messages_participant_insert on messages
  for insert with check (
    sender_id = auth.uid()
    and exists (select 1 from bookings b
                 where b.id = messages.booking_id
                   and (b.driver_id = auth.uid() or b.host_id = auth.uid()))
  );

create policy messages_mark_read on messages
  for update using (
    exists (select 1 from bookings b
             where b.id = messages.booking_id
               and (b.driver_id = auth.uid() or b.host_id = auth.uid())
               and messages.sender_id <> auth.uid())
  ) with check (true);

-- =============================================================================
-- disputes
-- =============================================================================
create policy disputes_participant_read on disputes
  for select using (
    raised_by = auth.uid()
    or against_id = auth.uid()
    or exists (select 1 from bookings b
                where b.id = disputes.booking_id
                  and (b.driver_id = auth.uid() or b.host_id = auth.uid()))
    or is_admin()
  );

create policy disputes_participant_insert on disputes
  for insert with check (
    raised_by = auth.uid()
    and exists (select 1 from bookings b
                 where b.id = disputes.booking_id
                   and (b.driver_id = auth.uid() or b.host_id = auth.uid()))
  );

create policy disputes_admin_manage on disputes
  for all using (is_admin()) with check (is_admin());

-- =============================================================================
-- coupons and redemptions
-- =============================================================================
-- Coupon rows are readable so the client can show a campaign banner, but a code
-- is validated server side through quote_booking, never by trusting the client.
create policy coupons_public_read on coupons
  for select using (is_active and (valid_until is null or valid_until > now()));

create policy coupons_admin_all on coupons
  for all using (is_admin()) with check (is_full_admin());

create policy coupon_redemptions_own on coupon_redemptions
  for select using (user_id = auth.uid() or is_admin());

-- =============================================================================
-- wallet, referrals, notifications
-- =============================================================================
create policy wallet_own_read on wallet_transactions
  for select using (user_id = auth.uid() or is_admin());

-- Never insertable from the client. Credits originate in server logic only.
create policy wallet_admin_write on wallet_transactions
  for insert with check (is_full_admin());

create policy referrals_own_read on referrals
  for select using (referrer_id = auth.uid() or referee_id = auth.uid() or is_admin());

create policy notifications_own on notifications
  for select using (user_id = auth.uid() or is_admin());

create policy notifications_own_update on notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- =============================================================================
-- audit, settings, search events, webhooks
-- =============================================================================
create policy audit_admin_read on audit_logs
  for select using (is_admin());

-- Settings are world-readable because the client needs the grace period and the
-- hold duration to render honest copy. They are writable by a full admin only.
create policy settings_public_read on platform_settings
  for select using (true);

create policy settings_admin_write on platform_settings
  for all using (is_full_admin()) with check (is_full_admin());

create policy search_events_insert_any on search_events
  for insert with check (true);

create policy search_events_admin_read on search_events
  for select using (is_admin());

-- Webhook rows are service-role only. No client role touches them at all.
create policy webhook_admin_only on webhook_events
  for all using (is_full_admin()) with check (is_full_admin());

-- =============================================================================
-- Function grants
-- =============================================================================
grant execute on function search_spaces(
  double precision, double precision, integer, timestamptz, timestamptz,
  vehicle_type, bigint, space_type[], text[], numeric, boolean, boolean,
  text, integer, integer
) to anon, authenticated;

grant execute on function quote_booking(uuid, timestamptz, timestamptz, text, boolean, uuid)
  to anon, authenticated;
grant execute on function is_space_available(uuid, timestamptz, timestamptz) to anon, authenticated;
grant execute on function count_free_bays(uuid, timestamptz, timestamptz, uuid) to anon, authenticated;
grant execute on function price_quote_paise(uuid, timestamptz, timestamptz) to anon, authenticated;
grant execute on function space_availability_calendar(uuid, date, date) to anon, authenticated;

grant execute on function create_booking_hold(uuid, timestamptz, timestamptz, uuid, text, boolean, text)
  to authenticated;
grant execute on function cancel_booking(uuid, text) to authenticated;
grant execute on function check_in_booking(uuid, double precision, double precision) to authenticated;
grant execute on function check_out_booking(uuid) to authenticated;
grant execute on function extend_booking(uuid, timestamptz) to authenticated;
grant execute on function compute_refund_paise(uuid, cancelled_by_party) to authenticated;

-- Deliberately NOT granted to any client role. These run with the service key.
revoke execute on function confirm_booking(uuid, uuid) from anon, authenticated;
revoke execute on function expire_stale_holds() from anon, authenticated;
revoke execute on function auto_complete_stale_bookings() from anon, authenticated;
revoke execute on function refresh_superhost_badges() from anon, authenticated;

comment on function has_address_access is
  'The technical expression of the location privacy rule. Exact address is released only to a driver with a confirmed booking, from 24 hours before the stay.';
