-- =============================================================================
-- ParkSpace 0003 — inventory: parking spaces, photos, availability
-- =============================================================================

-- -----------------------------------------------------------------------------
-- parking_spaces
-- -----------------------------------------------------------------------------
create table parking_spaces (
  id                  uuid primary key default gen_random_uuid(),
  host_id             uuid not null references profiles(id) on delete cascade,

  title               text not null check (char_length(title) between 8 and 120),
  description         text check (description is null or char_length(description) <= 4000),

  -- Address. `address_line` and `landmark` are exact and therefore protected by
  -- the location privacy rule; locality, city and postal code are public because
  -- they are what a search result legitimately needs to show.
  address_line        text not null,
  landmark            text,
  locality            text not null,
  city                text not null,
  state               text not null,
  postal_code         text,
  country             text not null default 'IN',

  -- The true coordinate. Exposed only to a driver holding a confirmed booking,
  -- enforced by the RLS policies and the public view in 0006.
  lat                 double precision not null check (lat between -90 and 90),
  lng                 double precision not null check (lng between -180 and 180),

  -- The jittered coordinate shown publicly. Generated once on insert by a trigger
  -- so it is stable: a marker that moved on every page load would look broken and
  -- would also leak the true point through averaging across repeated requests.
  approx_lat          double precision,
  approx_lng          double precision,

  space_type          space_type not null,
  vehicle_types       vehicle_type[] not null default array['hatchback','sedan']::vehicle_type[],

  -- capacity is the number of independently bookable bays. A booking claims one
  -- bay_index in [0, capacity). See the exclusion constraint in 0004.
  capacity            smallint not null default 1 check (capacity between 1 and 500),

  -- Millimetres, matching vehicles. height_mm is the one that ruins a driver's
  -- day when it is wrong, so the listing wizard makes it mandatory for covered
  -- and basement spaces.
  max_length_mm       integer check (max_length_mm is null or max_length_mm between 1000 and 30000),
  max_width_mm        integer check (max_width_mm is null or max_width_mm between 1000 and 10000),
  max_height_mm       integer check (max_height_mm is null or max_height_mm between 1000 and 10000),

  amenities           text[] not null default '{}',
  rules               text[] not null default '{}',

  -- Pricing, all in integer paise. A null price means that duration model is not
  -- offered. At least one must be present, checked below.
  price_hourly_paise  bigint check (price_hourly_paise is null or price_hourly_paise >= 0),
  price_daily_paise   bigint check (price_daily_paise is null or price_daily_paise >= 0),
  price_monthly_paise bigint check (price_monthly_paise is null or price_monthly_paise >= 0),
  currency            text not null default 'INR',

  min_booking_minutes integer not null default 30 check (min_booking_minutes >= 15),
  max_booking_minutes integer check (max_booking_minutes is null or max_booking_minutes >= min_booking_minutes),

  -- Lead time and notice protect hosts from a booking landing three minutes before
  -- the driver arrives at a gate nobody has opened.
  min_notice_minutes  integer not null default 0 check (min_notice_minutes >= 0),
  max_advance_days    integer not null default 90 check (max_advance_days between 1 and 365),

  instant_book        boolean not null default true,
  cancellation_policy cancellation_policy not null default 'moderate',

  access_method       access_method not null default 'open_access',
  -- Released to the driver only from 24 hours before start, and only on a
  -- confirmed booking. RLS enforces this, the UI merely reflects it.
  access_instructions text,
  access_pin          text,

  -- EV support is a first-class filter even though hardware integration is out of
  -- MVP scope: a host with a wall socket can still declare it.
  has_ev_charging     boolean not null default false,
  ev_connector_type   text,
  ev_power_kw         numeric(5,2) check (ev_power_kw is null or ev_power_kw > 0),
  ev_price_per_kwh_paise bigint check (ev_price_per_kwh_paise is null or ev_price_per_kwh_paise >= 0),

  status              listing_status not null default 'draft',
  rejection_reason    text,
  reviewed_by         uuid references profiles(id) on delete set null,
  reviewed_at         timestamptz,
  published_at        timestamptz,

  -- Denormalised review aggregates, maintained by a trigger in 0007.
  avg_rating          numeric(3,2) check (avg_rating is null or avg_rating between 1 and 5),
  review_count        integer not null default 0,
  booking_count       integer not null default 0,

  -- Search ranking inputs, refreshed by a scheduled job.
  popularity_score    integer not null default 0,

  -- Full-text search vector over the public-safe fields only.
  search_vector       tsvector,

  slug                text unique,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint spaces_has_a_price check (
    price_hourly_paise is not null
    or price_daily_paise is not null
    or price_monthly_paise is not null
  ),

  -- A listing cannot go live without the things a driver needs to trust it.
  constraint spaces_active_requires_completeness check (
    status <> 'active' or (
      description is not null
      and char_length(description) >= 40
      and approx_lat is not null
      and approx_lng is not null
    )
  )
);

create index spaces_host_idx           on parking_spaces(host_id);
create index spaces_status_idx         on parking_spaces(status);
create index spaces_city_locality_idx  on parking_spaces(city, locality) where status = 'active';
create index spaces_vehicle_types_idx  on parking_spaces using gin(vehicle_types);
create index spaces_amenities_idx      on parking_spaces using gin(amenities);
create index spaces_search_vector_idx  on parking_spaces using gin(search_vector);
create index spaces_title_trgm_idx     on parking_spaces using gin(title gin_trgm_ops);

-- The bounding-box prefilter index. Search narrows by a lat/lng rectangle first,
-- then applies the exact haversine distance, which is the standard cheap approach
-- when you are not carrying PostGIS.
create index spaces_geo_idx on parking_spaces(lat, lng) where status = 'active';

create trigger parking_spaces_updated_at
  before update on parking_spaces
  for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
-- Coordinate jitter: the location privacy rule, section 10 of the spec kernel
-- -----------------------------------------------------------------------------
-- The offset is deterministic per space, derived from the row id, so it never
-- moves. Distance is 80..150 m at a pseudo-random bearing.
create or replace function apply_location_jitter()
returns trigger
language plpgsql
as $$
declare
  seed        double precision;
  bearing     double precision;
  distance_m  double precision;
  d_lat       double precision;
  d_lng       double precision;
begin
  if new.approx_lat is not null
     and new.lat is not distinct from old.lat
     and new.lng is not distinct from old.lng then
    return new;  -- coordinate unchanged, keep the existing jitter stable
  end if;

  -- Two independent pseudo-random values in [0,1) derived from the uuid.
  seed       := ('x' || substr(md5(new.id::text), 1, 8))::bit(32)::bigint / 4294967296.0;
  bearing    := 2 * pi() * seed;
  distance_m := 80 + 70 * (('x' || substr(md5(new.id::text), 9, 8))::bit(32)::bigint / 4294967296.0);

  d_lat := (distance_m * cos(bearing)) * lat_degrees_per_m();
  d_lng := (distance_m * sin(bearing)) * lng_degrees_per_m(new.lat);

  new.approx_lat := round((new.lat + d_lat)::numeric, 6)::double precision;
  new.approx_lng := round((new.lng + d_lng)::numeric, 6)::double precision;

  return new;
end;
$$;

create trigger parking_spaces_jitter
  before insert or update of lat, lng on parking_spaces
  for each row execute function apply_location_jitter();

-- -----------------------------------------------------------------------------
-- Search vector and slug
-- -----------------------------------------------------------------------------
create or replace function parking_spaces_search_refresh()
returns trigger
language plpgsql
as $$
begin
  -- Deliberately excludes address_line, landmark and access_instructions so that
  -- a full-text query can never be used to fish for an exact address.
  new.search_vector :=
      setweight(to_tsvector('simple', coalesce(new.title, '')), 'A')
    || setweight(to_tsvector('simple', coalesce(new.locality, '')), 'A')
    || setweight(to_tsvector('simple', coalesce(new.city, '')), 'B')
    || setweight(to_tsvector('simple', coalesce(new.description, '')), 'C')
    || setweight(to_tsvector('simple', array_to_string(new.amenities, ' ')), 'D');

  if new.slug is null then
    new.slug := lower(regexp_replace(coalesce(new.title, 'space'), '[^a-zA-Z0-9]+', '-', 'g'))
                || '-' || substr(replace(new.id::text, '-', ''), 1, 8);
    new.slug := regexp_replace(new.slug, '^-+|-+$', '', 'g');
  end if;

  return new;
end;
$$;

create trigger parking_spaces_search
  before insert or update of title, description, locality, city, amenities
  on parking_spaces
  for each row execute function parking_spaces_search_refresh();

-- Stamp published_at the first time a listing goes active.
create or replace function parking_spaces_stamp_published()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'active' and (old.status is distinct from 'active') and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end;
$$;

create trigger parking_spaces_published
  before update of status on parking_spaces
  for each row execute function parking_spaces_stamp_published();

-- -----------------------------------------------------------------------------
-- space_photos
-- -----------------------------------------------------------------------------
create table space_photos (
  id            uuid primary key default gen_random_uuid(),
  space_id      uuid not null references parking_spaces(id) on delete cascade,
  storage_path  text not null,
  caption       text,
  -- 'entrance' | 'space' | 'access' | 'street' | 'surroundings' | 'signage'
  photo_kind    text not null default 'space',
  sort_order    smallint not null default 0,
  width         integer,
  height        integer,
  blurhash      text,
  created_at    timestamptz not null default now()
);

create index space_photos_space_idx on space_photos(space_id, sort_order);

-- -----------------------------------------------------------------------------
-- availability_rules — the recurring weekly pattern
-- -----------------------------------------------------------------------------
-- A space is bookable only inside a declared window. day_of_week follows the
-- Postgres convention: 0 = Sunday .. 6 = Saturday.
--
-- An overnight window such as 20:00 to 08:00 is expressed with
-- ends_next_day = true rather than by splitting it into two rows, because hosts
-- think in terms of one window and splitting it corrupts the edit experience.
create table availability_rules (
  id             uuid primary key default gen_random_uuid(),
  space_id       uuid not null references parking_spaces(id) on delete cascade,
  day_of_week    smallint not null check (day_of_week between 0 and 6),
  start_time     time not null,
  end_time       time not null,
  ends_next_day  boolean not null default false,
  created_at     timestamptz not null default now(),

  constraint availability_rules_sane_window
    check (ends_next_day or end_time > start_time)
);

create index availability_rules_space_idx on availability_rules(space_id, day_of_week);

-- -----------------------------------------------------------------------------
-- availability_blocks — blackouts that override the weekly pattern
-- -----------------------------------------------------------------------------
create table availability_blocks (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references parking_spaces(id) on delete cascade,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  period      tstzrange generated always as (tstzrange(starts_at, ends_at, '[)')) stored,
  reason      text,
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now(),

  constraint availability_blocks_ordered check (ends_at > starts_at)
);

create index availability_blocks_space_period_idx
  on availability_blocks using gist (space_id, period);

-- -----------------------------------------------------------------------------
-- price_overrides — date-specific pricing, the manual form of dynamic pricing
-- -----------------------------------------------------------------------------
-- MVP ships manual overrides only. Algorithmic pricing in V2 writes into the same
-- table, so the booking engine never has to learn a second pricing path.
create table price_overrides (
  id             uuid primary key default gen_random_uuid(),
  space_id       uuid not null references parking_spaces(id) on delete cascade,
  starts_at      timestamptz not null,
  ends_at        timestamptz not null,
  period         tstzrange generated always as (tstzrange(starts_at, ends_at, '[)')) stored,
  -- Basis points applied to the base price. 15000 = 1.5x for a match night.
  multiplier_bp  integer not null default 10000 check (multiplier_bp between 1000 and 100000),
  label          text,
  created_at     timestamptz not null default now(),

  constraint price_overrides_ordered check (ends_at > starts_at)
);

create index price_overrides_space_period_idx
  on price_overrides using gist (space_id, period);

comment on column parking_spaces.approx_lat is
  'Deterministically jittered coordinate, 80-150 m from the true point. This is the only coordinate exposed before a booking is confirmed.';
comment on column parking_spaces.capacity is
  'Number of independently bookable bays. A booking claims one bay_index in [0, capacity).';
