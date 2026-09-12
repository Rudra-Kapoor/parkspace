-- =============================================================================
-- ParkSpace 0004 — the booking engine
-- =============================================================================
-- This is the most important file in the repository. If anything here is wrong,
-- two drivers arrive at the same bay at the same time and the product is dead.
-- =============================================================================

create table bookings (
  id                  uuid primary key default gen_random_uuid(),
  code                text not null unique default generate_booking_code(),

  space_id            uuid not null references parking_spaces(id) on delete restrict,
  driver_id           uuid not null references profiles(id) on delete restrict,
  host_id             uuid not null references profiles(id) on delete restrict,
  vehicle_id          uuid references vehicles(id) on delete set null,

  -- Which bay of a multi-bay space this booking holds. Always 0 for a single-bay
  -- space. Part of the exclusion constraint below.
  bay_index           smallint not null default 0 check (bay_index >= 0),

  starts_at           timestamptz not null,
  ends_at             timestamptz not null,

  -- The generated range is what the exclusion constraint actually indexes.
  -- '[)' means start-inclusive, end-exclusive, so a booking ending at 14:00 and
  -- one starting at 14:00 do not overlap. That is the correct semantics for
  -- parking: the outgoing car leaves as the incoming car arrives.
  period              tstzrange generated always as
                        (tstzrange(starts_at, ends_at, '[)')) stored,

  status              booking_status not null default 'pending',

  -- A pending hold self-destructs at this instant if payment has not landed.
  hold_expires_at     timestamptz,

  -- ---------------------------------------------------------------------------
  -- Money. Every field is integer paise. See spec kernel section 7.
  -- ---------------------------------------------------------------------------
  base_amount_paise       bigint not null check (base_amount_paise >= 0),
  discount_amount_paise   bigint not null default 0 check (discount_amount_paise >= 0),
  wallet_applied_paise    bigint not null default 0 check (wallet_applied_paise >= 0),
  service_fee_paise       bigint not null default 0 check (service_fee_paise >= 0),
  tax_amount_paise        bigint not null default 0 check (tax_amount_paise >= 0),
  total_amount_paise      bigint not null check (total_amount_paise >= 0),
  host_commission_paise   bigint not null default 0 check (host_commission_paise >= 0),
  host_payout_paise       bigint not null default 0 check (host_payout_paise >= 0),
  currency                text not null default 'INR',

  -- The exact rates in force when the quote was struck, frozen onto the row.
  -- Changing HOST_COMMISSION_PCT next month must never restate last month's
  -- bookings, so the rate travels with the booking rather than being looked up.
  commission_rate_bp      integer not null default 1000,
  service_fee_rate_bp     integer not null default 500,
  tax_rate_bp             integer not null default 1800,

  coupon_code             text,
  coupon_id               uuid,

  cancellation_policy     cancellation_policy not null default 'moderate',

  -- ---------------------------------------------------------------------------
  -- Access and lifecycle
  -- ---------------------------------------------------------------------------
  -- Opaque token encoded into the QR shown at the gate. Rotated if the driver
  -- reports the QR was shared. Never the booking id itself, because the booking
  -- id appears in URLs.
  qr_token            text not null default encode(gen_random_bytes(24), 'hex'),

  checked_in_at       timestamptz,
  checked_out_at      timestamptz,
  checkin_lat         double precision,
  checkin_lng         double precision,
  -- Distance in metres between the check-in coordinate and the true space
  -- coordinate. A large value is the primary signal for GPS spoofing or for a
  -- listing whose pin is simply wrong. See 18_Security_Requirements.
  checkin_distance_m  integer,

  overstay_minutes    integer not null default 0 check (overstay_minutes >= 0),
  overstay_amount_paise bigint not null default 0 check (overstay_amount_paise >= 0),
  overstay_settled    boolean not null default false,

  extended_from_ends_at timestamptz,
  extension_count       smallint not null default 0,

  cancelled_at        timestamptz,
  cancelled_by        cancelled_by_party,
  cancellation_reason text,
  refund_amount_paise bigint not null default 0 check (refund_amount_paise >= 0),

  -- Snapshot of the space at the moment of booking. When a host edits the title
  -- or the price six months later, the driver's receipt must still describe what
  -- they actually bought.
  space_snapshot      jsonb,

  driver_notes        text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint bookings_ordered check (ends_at > starts_at),
  constraint bookings_checkout_after_checkin
    check (checked_out_at is null or checked_in_at is null or checked_out_at >= checked_in_at),
  constraint bookings_hold_has_expiry
    check (status <> 'pending' or hold_expires_at is not null),
  constraint bookings_cancel_fields
    check (status <> 'cancelled' or (cancelled_at is not null and cancelled_by is not null)),
  constraint bookings_total_is_consistent
    check (
      total_amount_paise =
        base_amount_paise - discount_amount_paise - wallet_applied_paise
        + service_fee_paise + tax_amount_paise
    )
);

-- =============================================================================
-- THE CONSTRAINT
-- =============================================================================
-- Two transactions cannot both commit a booking whose interval overlaps another
-- live booking on the same bay of the same space. The loser gets SQLSTATE 23P01
-- (exclusion_violation), which the application maps to SPACE_NO_LONGER_AVAILABLE.
--
-- Note which statuses participate. 'pending' is included, so the bay is held
-- while the driver is on the payment screen. 'cancelled', 'expired', 'no_show'
-- and 'completed' are excluded, so a released interval is immediately resellable.
-- =============================================================================
alter table bookings
  add constraint bookings_no_overlap
  exclude using gist (
    space_id  with =,
    bay_index with =,
    period    with &&
  )
  where (status in ('pending', 'confirmed', 'active'));

create index bookings_driver_idx      on bookings(driver_id, starts_at desc);
create index bookings_host_idx        on bookings(host_id, starts_at desc);
create index bookings_space_idx       on bookings(space_id, starts_at desc);
create index bookings_status_idx      on bookings(status);
create index bookings_code_idx        on bookings(code);
create index bookings_qr_token_idx    on bookings(qr_token);
-- Drives the hold-expiry sweeper.
create index bookings_hold_expiry_idx on bookings(hold_expires_at)
  where status = 'pending';
-- Drives the reminder scheduler and the auto-complete sweeper.
create index bookings_upcoming_idx    on bookings(starts_at)
  where status = 'confirmed';
create index bookings_active_idx      on bookings(ends_at)
  where status = 'active';

create trigger bookings_updated_at
  before update on bookings
  for each row execute function set_updated_at();

-- =============================================================================
-- State machine enforcement
-- =============================================================================
-- The application is not trusted to make only legal transitions. The database
-- rejects an illegal one outright.
create or replace function enforce_booking_transition()
returns trigger
language plpgsql
as $$
declare
  ok boolean := false;
begin
  if old.status = new.status then
    return new;
  end if;

  ok := case old.status
    when 'draft'     then new.status in ('pending', 'cancelled', 'expired')
    when 'pending'   then new.status in ('confirmed', 'cancelled', 'expired')
    when 'confirmed' then new.status in ('active', 'cancelled', 'no_show', 'disputed')
    when 'active'    then new.status in ('completed', 'disputed')
    when 'completed' then new.status in ('disputed')
    when 'disputed'  then new.status in ('completed', 'cancelled')
    -- Terminal states.
    when 'cancelled' then false
    when 'expired'   then false
    when 'no_show'   then false
    else false
  end;

  if not ok then
    raise exception
      'Illegal booking transition % -> % for booking %',
      old.status, new.status, old.code
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger bookings_transition_guard
  before update of status on bookings
  for each row execute function enforce_booking_transition();

-- =============================================================================
-- Counters
-- =============================================================================
create or replace function bookings_maintain_counters()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    update profiles set bookings_completed = bookings_completed + 1 where id = new.driver_id;
    update parking_spaces set booking_count = booking_count + 1 where id = new.space_id;
    update host_profiles
      set total_earnings_paise  = total_earnings_paise + new.host_payout_paise,
          payable_balance_paise = payable_balance_paise + new.host_payout_paise
      where user_id = new.host_id;
  end if;

  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    if new.cancelled_by = 'driver' then
      update profiles set bookings_cancelled = bookings_cancelled + 1 where id = new.driver_id;
    elsif new.cancelled_by = 'host' then
      update host_profiles
        set cancellation_count_90d = cancellation_count_90d + 1
        where user_id = new.host_id;
    end if;
  end if;

  return new;
end;
$$;

create trigger bookings_counters
  after update of status on bookings
  for each row execute function bookings_maintain_counters();

-- =============================================================================
-- booking_events — an append-only trail of everything that happened
-- =============================================================================
-- Disputes are won and lost on this table. It is never updated and never deleted.
create table booking_events (
  id          bigserial primary key,
  booking_id  uuid not null references bookings(id) on delete cascade,
  event_type  text not null,
  actor_id    uuid references profiles(id) on delete set null,
  actor_role  text,
  from_status booking_status,
  to_status   booking_status,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index booking_events_booking_idx on booking_events(booking_id, created_at);

create or replace function log_booking_event()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    insert into booking_events (booking_id, event_type, to_status, metadata)
    values (new.id, 'created', new.status,
            jsonb_build_object('total_paise', new.total_amount_paise, 'space_id', new.space_id));
  elsif old.status is distinct from new.status then
    insert into booking_events (booking_id, event_type, from_status, to_status)
    values (new.id, 'status_changed', old.status, new.status);
  end if;
  return new;
end;
$$;

create trigger bookings_event_log
  after insert or update of status on bookings
  for each row execute function log_booking_event();

comment on constraint bookings_no_overlap on bookings is
  'The core correctness guarantee. Makes concurrent double-booking of a bay impossible at the storage layer rather than unlikely at the application layer.';
