-- =============================================================================
-- ParkSpace 0002 — identity: profiles, vehicles, host profiles, verification
-- =============================================================================

-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------
-- One row per auth.users row, created automatically by a trigger so that no code
-- path can ever produce an authenticated user without a profile.
create table profiles (
  id                  uuid primary key references auth.users(id) on delete cascade,
  full_name           text,
  phone               text unique,
  phone_verified_at   timestamptz,
  email               text,
  avatar_url          text,

  role                user_role not null default 'driver',
  roles               user_role[] not null default array['driver']::user_role[],

  verification        verification_status not null default 'unverified',

  -- Trust score is a derived 0..100 value maintained by 0007. It is stored rather
  -- than computed on read because it participates in search ranking.
  trust_score         smallint not null default 50
                        check (trust_score between 0 and 100),

  -- Denormalised counters. Kept correct by triggers, never written by the client.
  bookings_completed  integer not null default 0,
  bookings_cancelled  integer not null default 0,

  wallet_balance_paise bigint not null default 0 check (wallet_balance_paise >= 0),

  referral_code       text unique,
  referred_by         uuid references profiles(id) on delete set null,

  preferred_locale    text not null default 'en-IN',
  timezone            text not null default 'Asia/Kolkata',

  notification_prefs  jsonb not null default
                        '{"push":true,"email":true,"sms":true,"whatsapp":false,"marketing":false}'::jsonb,

  is_suspended        boolean not null default false,
  suspended_reason    text,
  suspended_at        timestamptz,

  last_seen_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint profiles_role_in_roles check (role = any(roles)),
  constraint profiles_phone_format check (phone is null or phone ~ '^\+?[0-9]{10,15}$')
);

create index profiles_role_idx on profiles(role);
create index profiles_referral_code_idx on profiles(referral_code);
create index profiles_referred_by_idx on profiles(referred_by) where referred_by is not null;

create trigger profiles_updated_at
  before update on profiles
  for each row execute function set_updated_at();

-- Auto-provision a profile the moment Supabase Auth creates a user.
create or replace function handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  code text;
begin
  -- Referral codes are short and collision-checked in a bounded loop.
  loop
    code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    exit when not exists (select 1 from profiles p where p.referral_code = code);
  end loop;

  insert into profiles (id, email, full_name, phone, avatar_url, referral_code)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.phone,
    new.raw_user_meta_data->>'avatar_url',
    code
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_auth_user();

-- -----------------------------------------------------------------------------
-- vehicles
-- -----------------------------------------------------------------------------
-- Vehicle data is not decoration. It is how a security guard matches a car to a
-- booking, how a host knows the SUV will fit, and how a dispute about the wrong
-- vehicle is settled.
create table vehicles (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null references profiles(id) on delete cascade,

  registration_number text not null,
  vehicle_type        vehicle_type not null,
  make                text,
  model               text,
  colour              text,

  -- Millimetres. Optional, but when present the search filter can rule out a
  -- space whose height clearance would strand the driver at the entrance.
  length_mm           integer check (length_mm is null or length_mm between 500 and 20000),
  width_mm            integer check (width_mm is null or width_mm between 300 and 5000),
  height_mm           integer check (height_mm is null or height_mm between 500 and 5000),

  is_electric         boolean not null default false,
  is_default          boolean not null default false,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- Indian plates, normalised to uppercase without separators before storage.
  constraint vehicles_registration_format
    check (registration_number ~ '^[A-Z0-9]{4,15}$')
);

-- One plate may legitimately appear once per owner, never twice.
create unique index vehicles_owner_registration_key
  on vehicles(owner_id, registration_number);

-- Exactly one default vehicle per owner, enforced by a partial unique index
-- rather than by application code.
create unique index vehicles_one_default_per_owner
  on vehicles(owner_id) where is_default;

create index vehicles_owner_idx on vehicles(owner_id);

create trigger vehicles_updated_at
  before update on vehicles
  for each row execute function set_updated_at();

-- Normalise the plate on the way in so that "WB 02 AB 1234" and "wb02ab1234"
-- are the same vehicle.
create or replace function normalise_vehicle_registration()
returns trigger
language plpgsql
as $$
begin
  new.registration_number := upper(regexp_replace(new.registration_number, '[^A-Za-z0-9]', '', 'g'));
  return new;
end;
$$;

create trigger vehicles_normalise_registration
  before insert or update of registration_number on vehicles
  for each row execute function normalise_vehicle_registration();

-- The first vehicle a user adds becomes the default automatically.
create or replace function ensure_default_vehicle()
returns trigger
language plpgsql
as $$
begin
  if new.is_default then
    update vehicles set is_default = false
      where owner_id = new.owner_id and id <> new.id and is_default;
  elsif not exists (
    select 1 from vehicles v where v.owner_id = new.owner_id and v.id <> new.id
  ) then
    new.is_default := true;
  end if;
  return new;
end;
$$;

create trigger vehicles_ensure_default
  before insert or update of is_default on vehicles
  for each row execute function ensure_default_vehicle();

-- -----------------------------------------------------------------------------
-- host_profiles
-- -----------------------------------------------------------------------------
create table host_profiles (
  user_id             uuid primary key references profiles(id) on delete cascade,

  display_name        text not null,
  bio                 text,
  is_business         boolean not null default false,
  business_name       text,
  business_type       text,

  kyc_status          verification_status not null default 'unverified',
  kyc_submitted_at    timestamptz,
  kyc_reviewed_at     timestamptz,
  kyc_reviewer_id     uuid references profiles(id) on delete set null,
  kyc_rejection_reason text,

  -- Payout destination is stored as an opaque reference issued by the payment
  -- provider. Raw bank details never enter this database. See 15_Payment_Specification.
  payout_ref          text,
  payout_ref_provider text,

  -- Reliability signals feeding search ranking and the Superhost badge.
  response_rate_bp    integer not null default 10000 check (response_rate_bp between 0 and 10000),
  acceptance_rate_bp  integer not null default 10000 check (acceptance_rate_bp between 0 and 10000),
  cancellation_count_90d integer not null default 0,
  avg_response_minutes integer,

  is_superhost        boolean not null default false,
  superhost_since     timestamptz,

  total_earnings_paise bigint not null default 0,
  payable_balance_paise bigint not null default 0,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint host_business_name_required
    check (not is_business or business_name is not null)
);

create index host_profiles_kyc_idx on host_profiles(kyc_status);
create index host_profiles_superhost_idx on host_profiles(is_superhost) where is_superhost;

create trigger host_profiles_updated_at
  before update on host_profiles
  for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
-- verification_documents
-- -----------------------------------------------------------------------------
-- Only a storage path is stored, never the document itself and never an extracted
-- identifier number. The bucket is private and is readable exclusively by the
-- owner and by admins. See 19_Privacy_Requirements.
create table verification_documents (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references profiles(id) on delete cascade,

  doc_kind            text not null,      -- 'identity' | 'address' | 'ownership' | 'business'
  storage_path        text not null,
  original_filename   text,
  mime_type           text,
  size_bytes          integer,

  status              verification_status not null default 'pending',
  reviewer_id         uuid references profiles(id) on delete set null,
  reviewed_at         timestamptz,
  rejection_reason    text,

  -- Documents are evidence with a shelf life. 0008 schedules their deletion.
  expires_at          timestamptz,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index verification_documents_user_idx on verification_documents(user_id);
create index verification_documents_status_idx on verification_documents(status)
  where status in ('pending', 'in_review');

create trigger verification_documents_updated_at
  before update on verification_documents
  for each row execute function set_updated_at();

comment on table verification_documents is
  'Stores only a private storage pointer. Never store an identity number or a document image in a column.';
