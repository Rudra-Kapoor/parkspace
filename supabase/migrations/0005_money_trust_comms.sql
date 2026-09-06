-- =============================================================================
-- ParkSpace 0005 — payments, refunds, payouts, reviews, messaging, disputes,
--                  coupons, wallet, referrals, notifications, audit, settings
-- =============================================================================

-- -----------------------------------------------------------------------------
-- payments
-- -----------------------------------------------------------------------------
create table payments (
  id                uuid primary key default gen_random_uuid(),
  booking_id        uuid not null references bookings(id) on delete restrict,
  payer_id          uuid not null references profiles(id) on delete restrict,

  provider          text not null,          -- 'mock' | 'razorpay' | ...
  provider_order_id text,
  provider_payment_id text,
  method            text,                   -- 'upi' | 'card' | 'netbanking' | 'wallet'

  amount_paise      bigint not null check (amount_paise >= 0),
  currency          text not null default 'INR',
  status            payment_status not null default 'created',

  -- Idempotency. The client generates this and sends it with the create call, so
  -- a double-clicked Pay button produces one payment, not two. See section on
  -- webhook replay in 15_Payment_Specification.
  idempotency_key   text unique,

  failure_code      text,
  failure_reason    text,

  authorized_at     timestamptz,
  captured_at       timestamptz,

  -- The raw provider payload, retained for reconciliation and dispute evidence.
  -- Card numbers never appear here: the provider returns a token, not a PAN.
  raw_payload       jsonb,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index payments_booking_idx on payments(booking_id);
create index payments_payer_idx on payments(payer_id, created_at desc);
create index payments_provider_payment_idx on payments(provider, provider_payment_id);
create index payments_status_idx on payments(status);

create trigger payments_updated_at
  before update on payments
  for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
-- webhook_events — replay protection
-- -----------------------------------------------------------------------------
-- Every gateway retries. Some retry for days. The unique constraint on the
-- provider's own event id is what makes handling a webhook exactly-once.
create table webhook_events (
  id                uuid primary key default gen_random_uuid(),
  provider          text not null,
  provider_event_id text not null,
  event_type        text not null,
  signature_valid   boolean not null,
  payload           jsonb not null,
  processed_at      timestamptz,
  processing_error  text,
  received_at       timestamptz not null default now(),

  constraint webhook_events_unique_per_provider unique (provider, provider_event_id)
);

create index webhook_events_unprocessed_idx on webhook_events(received_at)
  where processed_at is null;

-- -----------------------------------------------------------------------------
-- refunds
-- -----------------------------------------------------------------------------
create table refunds (
  id                uuid primary key default gen_random_uuid(),
  payment_id        uuid not null references payments(id) on delete restrict,
  booking_id        uuid not null references bookings(id) on delete restrict,

  amount_paise      bigint not null check (amount_paise > 0),
  -- What the driver got back is not the whole story. These three fields make the
  -- split auditable without recomputing policy months later.
  policy_applied    cancellation_policy,
  host_retained_paise bigint not null default 0 check (host_retained_paise >= 0),
  platform_retained_paise bigint not null default 0 check (platform_retained_paise >= 0),

  reason            text not null,
  status            refund_status not null default 'requested',

  provider_refund_id text,
  requested_by      uuid references profiles(id) on delete set null,
  approved_by       uuid references profiles(id) on delete set null,
  approved_at       timestamptz,
  completed_at      timestamptz,
  failure_reason    text,

  -- A refund issued to wallet credit rather than to the source instrument.
  to_wallet         boolean not null default false,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index refunds_booking_idx on refunds(booking_id);
create index refunds_status_idx on refunds(status) where status in ('requested','processing');

create trigger refunds_updated_at
  before update on refunds
  for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
-- payouts
-- -----------------------------------------------------------------------------
create table payouts (
  id              uuid primary key default gen_random_uuid(),
  host_id         uuid not null references profiles(id) on delete restrict,
  amount_paise    bigint not null check (amount_paise > 0),
  currency        text not null default 'INR',
  period_start    timestamptz not null,
  period_end      timestamptz not null,
  booking_count   integer not null default 0,
  status          payout_status not null default 'scheduled',
  provider        text,
  provider_payout_id text,
  utr_reference   text,
  scheduled_for   timestamptz,
  paid_at         timestamptz,
  failure_reason  text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint payouts_period_ordered check (period_end > period_start)
);

create index payouts_host_idx on payouts(host_id, created_at desc);
create index payouts_status_idx on payouts(status);

create trigger payouts_updated_at
  before update on payouts
  for each row execute function set_updated_at();

-- Line items linking a payout back to the exact bookings it settles.
create table payout_items (
  payout_id     uuid not null references payouts(id) on delete cascade,
  booking_id    uuid not null references bookings(id) on delete restrict,
  amount_paise  bigint not null,
  primary key (payout_id, booking_id)
);

-- -----------------------------------------------------------------------------
-- reviews — two-sided, and mutually blind until both are in
-- -----------------------------------------------------------------------------
create table reviews (
  id              uuid primary key default gen_random_uuid(),
  booking_id      uuid not null references bookings(id) on delete cascade,
  space_id        uuid references parking_spaces(id) on delete cascade,
  author_id       uuid not null references profiles(id) on delete cascade,
  subject_id      uuid not null references profiles(id) on delete cascade,
  direction       review_direction not null,

  rating          smallint not null check (rating between 1 and 5),
  -- Sub-ratings apply to driver_to_host only.
  rating_accuracy      smallint check (rating_accuracy between 1 and 5),
  rating_safety        smallint check (rating_safety between 1 and 5),
  rating_cleanliness   smallint check (rating_cleanliness between 1 and 5),
  rating_accessibility smallint check (rating_accessibility between 1 and 5),
  rating_value         smallint check (rating_value between 1 and 5),

  comment         text check (comment is null or char_length(comment) <= 2000),

  -- Blind review window: a review stays hidden until the counterparty submits
  -- theirs or the 14 day window closes, whichever is first. Stops retaliation.
  is_published    boolean not null default false,
  published_at    timestamptz,

  host_response   text check (host_response is null or char_length(host_response) <= 1000),
  host_responded_at timestamptz,

  is_flagged      boolean not null default false,
  flagged_reason  text,
  is_hidden       boolean not null default false,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- One review per direction per booking.
  constraint reviews_one_per_direction unique (booking_id, direction),
  constraint reviews_no_self_review check (author_id <> subject_id)
);

create index reviews_space_idx on reviews(space_id, created_at desc) where is_published and not is_hidden;
create index reviews_subject_idx on reviews(subject_id) where is_published and not is_hidden;
create index reviews_author_idx on reviews(author_id);

create trigger reviews_updated_at
  before update on reviews
  for each row execute function set_updated_at();

-- Publish both halves as soon as the second one arrives.
create or replace function reviews_publish_when_complete()
returns trigger
language plpgsql
as $$
declare
  counterpart_exists boolean;
begin
  select exists (
    select 1 from reviews r
     where r.booking_id = new.booking_id
       and r.direction <> new.direction
  ) into counterpart_exists;

  if counterpart_exists then
    update reviews
       set is_published = true, published_at = now()
     where booking_id = new.booking_id and not is_published;
  end if;

  return new;
end;
$$;

create trigger reviews_publish_pair
  after insert on reviews
  for each row execute function reviews_publish_when_complete();

-- Keep the space and host aggregates honest.
create or replace function reviews_refresh_aggregates()
returns trigger
language plpgsql
as $$
declare
  target_space uuid := coalesce(new.space_id, old.space_id);
begin
  if target_space is not null then
    update parking_spaces ps
       set avg_rating = sub.avg_rating,
           review_count = sub.cnt
      from (
        select round(avg(rating)::numeric, 2) as avg_rating, count(*) as cnt
          from reviews
         where space_id = target_space
           and direction = 'driver_to_host'
           and is_published and not is_hidden
      ) sub
     where ps.id = target_space;
  end if;
  return null;
end;
$$;

create trigger reviews_aggregates
  after insert or update or delete on reviews
  for each row execute function reviews_refresh_aggregates();

-- -----------------------------------------------------------------------------
-- messages
-- -----------------------------------------------------------------------------
-- Scoped to a booking. Personal phone numbers are never exposed by the platform,
-- so this is the channel. A redaction trigger strips obvious contact details to
-- discourage taking the transaction off-platform, which is also how fraud starts.
create table messages (
  id            uuid primary key default gen_random_uuid(),
  booking_id    uuid not null references bookings(id) on delete cascade,
  sender_id     uuid not null references profiles(id) on delete cascade,
  body          text not null check (char_length(body) between 1 and 4000),
  is_system     boolean not null default false,
  redacted      boolean not null default false,
  read_at       timestamptz,
  created_at    timestamptz not null default now()
);

create index messages_booking_idx on messages(booking_id, created_at);
create index messages_unread_idx on messages(booking_id) where read_at is null;

create or replace function messages_redact_contacts()
returns trigger
language plpgsql
as $$
declare
  original text := new.body;
begin
  if new.is_system then
    return new;
  end if;

  -- Phone-like runs of 10+ digits, and email addresses.
  new.body := regexp_replace(new.body, '(\+?\d[\d\s().-]{8,}\d)', '[contact hidden]', 'g');
  new.body := regexp_replace(new.body, '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[contact hidden]', 'g');

  if new.body is distinct from original then
    new.redacted := true;
  end if;

  return new;
end;
$$;

create trigger messages_redact
  before insert on messages
  for each row execute function messages_redact_contacts();

-- -----------------------------------------------------------------------------
-- disputes
-- -----------------------------------------------------------------------------
create table disputes (
  id              uuid primary key default gen_random_uuid(),
  booking_id      uuid not null references bookings(id) on delete restrict,
  raised_by       uuid not null references profiles(id) on delete restrict,
  against_id      uuid references profiles(id) on delete set null,

  category        dispute_category not null,
  description     text not null check (char_length(description) between 10 and 4000),
  evidence_paths  text[] not null default '{}',

  status          dispute_status not null default 'open',
  -- P0 safety, P1 blocked, P2 money, P3 other. Drives the support SLA.
  priority        smallint not null default 2 check (priority between 0 and 3),

  assigned_to     uuid references profiles(id) on delete set null,
  resolution_note text,
  resolved_at     timestamptz,
  refund_id       uuid references refunds(id) on delete set null,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index disputes_booking_idx on disputes(booking_id);
create index disputes_status_idx on disputes(status, priority) where status in ('open','investigating','awaiting_user');
create index disputes_assigned_idx on disputes(assigned_to) where assigned_to is not null;

create trigger disputes_updated_at
  before update on disputes
  for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
-- coupons
-- -----------------------------------------------------------------------------
create table coupons (
  id                  uuid primary key default gen_random_uuid(),
  code                text not null unique,
  description         text,
  coupon_type         coupon_type not null,
  -- flat: paise. percent: basis points, so 1000 = 10%.
  value               bigint not null check (value > 0),
  max_discount_paise  bigint check (max_discount_paise is null or max_discount_paise > 0),
  min_booking_paise   bigint not null default 0 check (min_booking_paise >= 0),

  max_redemptions     integer check (max_redemptions is null or max_redemptions > 0),
  max_per_user        integer not null default 1 check (max_per_user > 0),
  redemption_count    integer not null default 0,

  new_users_only      boolean not null default false,
  first_booking_only  boolean not null default false,
  restricted_cities   text[],

  valid_from          timestamptz not null default now(),
  valid_until         timestamptz,
  is_active           boolean not null default true,

  created_by          uuid references profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint coupons_percent_bounds
    check (coupon_type <> 'percent' or value <= 10000),
  constraint coupons_window_ordered
    check (valid_until is null or valid_until > valid_from)
);

create index coupons_code_idx on coupons(upper(code));
create index coupons_active_idx on coupons(is_active, valid_until) where is_active;

create trigger coupons_updated_at
  before update on coupons
  for each row execute function set_updated_at();

create table coupon_redemptions (
  id            uuid primary key default gen_random_uuid(),
  coupon_id     uuid not null references coupons(id) on delete cascade,
  user_id       uuid not null references profiles(id) on delete cascade,
  booking_id    uuid not null references bookings(id) on delete cascade,
  discount_paise bigint not null check (discount_paise >= 0),
  created_at    timestamptz not null default now(),

  constraint coupon_redemptions_once_per_booking unique (coupon_id, booking_id)
);

create index coupon_redemptions_user_idx on coupon_redemptions(user_id, coupon_id);

-- -----------------------------------------------------------------------------
-- wallet_transactions — an append-only ledger
-- -----------------------------------------------------------------------------
-- Rows are never updated. profiles.wallet_balance_paise is a cache of the sum,
-- maintained by the trigger below, and can always be rebuilt from this table.
create table wallet_transactions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles(id) on delete cascade,
  txn_type        wallet_txn_type not null,
  -- Signed. Credits positive, debits negative.
  amount_paise    bigint not null check (amount_paise <> 0),
  balance_after_paise bigint not null check (balance_after_paise >= 0),
  reference_type  text,
  reference_id    uuid,
  note            text,
  expires_at      timestamptz,
  created_at      timestamptz not null default now()
);

create index wallet_transactions_user_idx on wallet_transactions(user_id, created_at desc);

create or replace function wallet_apply_transaction()
returns trigger
language plpgsql
as $$
declare
  current_balance bigint;
begin
  select wallet_balance_paise into current_balance
    from profiles where id = new.user_id for update;

  if current_balance + new.amount_paise < 0 then
    raise exception 'Insufficient wallet balance: have %, need %',
      current_balance, abs(new.amount_paise)
      using errcode = 'check_violation';
  end if;

  new.balance_after_paise := current_balance + new.amount_paise;

  update profiles
     set wallet_balance_paise = new.balance_after_paise
   where id = new.user_id;

  return new;
end;
$$;

create trigger wallet_transactions_apply
  before insert on wallet_transactions
  for each row execute function wallet_apply_transaction();

-- -----------------------------------------------------------------------------
-- referrals
-- -----------------------------------------------------------------------------
create table referrals (
  id                uuid primary key default gen_random_uuid(),
  referrer_id       uuid not null references profiles(id) on delete cascade,
  referee_id        uuid not null references profiles(id) on delete cascade,
  code              text not null,
  -- Reward is released only after the referee completes a first booking, which
  -- is what stops referral farming with throwaway accounts.
  status            text not null default 'pending',  -- pending | qualified | rewarded | void
  qualifying_booking_id uuid references bookings(id) on delete set null,
  reward_paise      bigint not null default 0,
  rewarded_at       timestamptz,
  created_at        timestamptz not null default now(),

  constraint referrals_no_self check (referrer_id <> referee_id),
  constraint referrals_one_per_referee unique (referee_id)
);

create index referrals_referrer_idx on referrals(referrer_id);

-- -----------------------------------------------------------------------------
-- notifications
-- -----------------------------------------------------------------------------
create table notifications (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(id) on delete cascade,
  channel       notification_channel not null default 'in_app',
  template_key  text not null,
  title         text not null,
  body          text not null,
  action_url    text,
  data          jsonb not null default '{}'::jsonb,

  -- Set for scheduled sends such as the T-30-minute reminder.
  send_after    timestamptz,
  sent_at       timestamptz,
  read_at       timestamptz,
  failed_reason text,

  -- Stops a duplicate reminder if the scheduler runs twice.
  dedupe_key    text,

  created_at    timestamptz not null default now()
);

create unique index notifications_dedupe_idx on notifications(dedupe_key)
  where dedupe_key is not null;
create index notifications_user_idx on notifications(user_id, created_at desc);
create index notifications_unread_idx on notifications(user_id) where read_at is null;
create index notifications_pending_idx on notifications(send_after)
  where sent_at is null;

-- -----------------------------------------------------------------------------
-- audit_logs
-- -----------------------------------------------------------------------------
create table audit_logs (
  id            bigserial primary key,
  actor_id      uuid references profiles(id) on delete set null,
  actor_role    user_role,
  action        text not null,
  entity_type   text not null,
  entity_id     text,
  before_state  jsonb,
  after_state   jsonb,
  ip_address    inet,
  user_agent    text,
  created_at    timestamptz not null default now()
);

create index audit_logs_actor_idx on audit_logs(actor_id, created_at desc);
create index audit_logs_entity_idx on audit_logs(entity_type, entity_id, created_at desc);
create index audit_logs_action_idx on audit_logs(action, created_at desc);

-- -----------------------------------------------------------------------------
-- platform_settings — the business rule engine
-- -----------------------------------------------------------------------------
-- Commission, fees, grace period and hold duration are configuration, not code.
-- Changing them must not require a deploy, and must be audited.
create table platform_settings (
  key           text primary key,
  value         jsonb not null,
  description   text,
  updated_by    uuid references profiles(id) on delete set null,
  updated_at    timestamptz not null default now()
);

insert into platform_settings (key, value, description) values
  ('HOST_COMMISSION_PCT',    '0.10',  'Share of the taxable amount retained from the host.'),
  ('DRIVER_SERVICE_FEE_PCT', '0.05',  'Service fee added on top of the driver total.'),
  ('GST_PCT',                '0.18',  'Placeholder tax rate on platform fees. REVIEW REQUIRED with a chartered accountant.'),
  ('BOOKING_HOLD_MINUTES',   '10',    'How long a pending hold reserves the bay while payment is attempted.'),
  ('GRACE_PERIOD_MINUTES',   '10',    'Free overstay allowance before overstay charging begins.'),
  ('MIN_BOOKING_MINUTES',    '30',    'Global floor on booking duration.'),
  ('MAX_BOOKING_DAYS',       '90',    'Global ceiling on booking duration.'),
  ('OVERSTAY_MULTIPLIER',    '1.5',   'Multiplier applied to the hourly rate for overstay time.'),
  ('REFERRAL_REWARD_PAISE',  '10000', 'Rs 100 to each side, released after the referee completes a booking.'),
  ('SEARCH_DEFAULT_RADIUS_M','1500',  'Default search radius in metres.'),
  ('SEARCH_MAX_RADIUS_M',    '10000', 'Hard ceiling on search radius.'),
  ('REVIEW_WINDOW_DAYS',     '14',    'Blind review window before unpaired reviews auto-publish.'),
  ('SUPERHOST_MIN_RATING',   '4.7',   'Rating floor for the Superhost badge.'),
  ('SUPERHOST_MIN_BOOKINGS', '10',    'Completed bookings required for the Superhost badge.'),
  ('PAYOUT_DELAY_HOURS',     '24',    'Delay after checkout before host earnings become payable.'),
  ('MAX_EXTENSIONS',         '3',     'How many times a driver may extend one booking.')
on conflict (key) do nothing;

create trigger platform_settings_updated_at
  before update on platform_settings
  for each row execute function set_updated_at();

-- Typed accessors so callers never parse jsonb by hand.
create or replace function setting_numeric(setting_key text, fallback numeric)
returns numeric
language sql
stable
as $$
  select coalesce((select value::text::numeric from platform_settings where key = setting_key), fallback);
$$;

create or replace function setting_int(setting_key text, fallback integer)
returns integer
language sql
stable
as $$
  select coalesce((select value::text::integer from platform_settings where key = setting_key), fallback);
$$;

-- -----------------------------------------------------------------------------
-- search_events — analytics, and the demand signal for supply acquisition
-- -----------------------------------------------------------------------------
-- A search that returns zero results in a locality is the single most valuable
-- row in this database: it names a street where we should go recruit a host.
create table search_events (
  id              bigserial primary key,
  user_id         uuid references profiles(id) on delete set null,
  session_id      text,
  query_text      text,
  lat             double precision,
  lng             double precision,
  radius_m        integer,
  starts_at       timestamptz,
  ends_at         timestamptz,
  filters         jsonb not null default '{}'::jsonb,
  result_count    integer not null default 0,
  clicked_space_id uuid references parking_spaces(id) on delete set null,
  booked          boolean not null default false,
  created_at      timestamptz not null default now()
);

create index search_events_created_idx on search_events(created_at desc);
create index search_events_zero_results_idx on search_events(lat, lng, created_at desc)
  where result_count = 0;

comment on index search_events_zero_results_idx is
  'Powers the supply gap map in the admin panel. Zero-result searches are the demand signal that tells the field team which street to canvass next.';
