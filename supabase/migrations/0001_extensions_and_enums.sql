-- =============================================================================
-- ParkSpace 0001 — extensions, enums and shared helpers
-- =============================================================================
-- Everything downstream depends on this file. It installs the two extensions the
-- booking engine cannot work without, defines the vocabulary of the domain as
-- Postgres enums so that an invalid state is unrepresentable, and creates the
-- small helper functions used by later migrations.
-- =============================================================================

-- btree_gist is the one that matters. A GiST index natively understands range
-- overlap (&&) but not equality on a scalar like space_id. btree_gist teaches GiST
-- how to handle the scalar, which is what lets us write the composite exclusion
-- constraint in 0004 that makes double-booking impossible.
create extension if not exists btree_gist;

-- Used for gen_random_uuid(). Present by default on Supabase, declared for clarity
-- so the migration runs on a bare Postgres too.
create extension if not exists pgcrypto;

-- Trigram index support for fuzzy title/locality search.
create extension if not exists pg_trgm;

-- =============================================================================
-- Enums
-- =============================================================================

-- Roles. A profile carries one active role plus an array of granted roles, so a
-- person can be both a driver and a host without holding two accounts.
create type user_role as enum (
  'driver',
  'host',
  'operator',
  'admin',
  'support'
);

create type verification_status as enum (
  'unverified',
  'pending',
  'in_review',
  'verified',
  'rejected',
  'suspended'
);

-- The physical nature of the space. Drives iconography, filtering and the
-- weather/security expectations a driver forms before booking.
create type space_type as enum (
  'driveway',
  'garage',
  'covered_lot',
  'open_lot',
  'basement',
  'stack_parking',
  'street_side',
  'multi_level'
);

create type vehicle_type as enum (
  'two_wheeler',
  'hatchback',
  'sedan',
  'suv',
  'electric',
  'commercial'
);

create type listing_status as enum (
  'draft',
  'pending_review',
  'active',
  'paused',
  'rejected',
  'delisted'
);

-- The booking lifecycle from the spec kernel, section 9. Transitions are policed
-- by a trigger in 0004, so an illegal jump is rejected by the database and not
-- merely discouraged by the application.
create type booking_status as enum (
  'draft',
  'pending',      -- a hold: the interval is reserved while payment is attempted
  'confirmed',    -- paid, in the future
  'active',       -- driver has checked in
  'completed',    -- checked out cleanly
  'cancelled',
  'expired',      -- the hold timed out before payment landed
  'no_show',
  'disputed'
);

create type cancellation_policy as enum (
  'flexible',
  'moderate',
  'strict',
  'non_refundable'
);

create type cancelled_by_party as enum (
  'driver',
  'host',
  'platform',
  'system'
);

create type payment_status as enum (
  'created',
  'authorized',
  'captured',
  'failed',
  'refunded',
  'partially_refunded'
);

create type refund_status as enum (
  'requested',
  'processing',
  'completed',
  'rejected',
  'failed'
);

create type payout_status as enum (
  'scheduled',
  'processing',
  'paid',
  'failed',
  'on_hold'
);

create type review_direction as enum (
  'driver_to_host',
  'host_to_driver'
);

create type dispute_category as enum (
  'space_unavailable',
  'access_failure',
  'wrong_location',
  'space_too_small',
  'vehicle_blocked',
  'unsafe_location',
  'overcharged',
  'vehicle_damage',
  'property_damage',
  'host_no_show',
  'driver_no_show',
  'other'
);

create type dispute_status as enum (
  'open',
  'investigating',
  'awaiting_user',
  'resolved_driver',
  'resolved_host',
  'resolved_split',
  'rejected',
  'withdrawn'
);

create type notification_channel as enum (
  'in_app',
  'push',
  'email',
  'sms',
  'whatsapp'
);

create type wallet_txn_type as enum (
  'refund_credit',
  'referral_credit',
  'promo_credit',
  'compensation',
  'booking_spend',
  'withdrawal',
  'adjustment'
);

create type coupon_type as enum (
  'flat',       -- value is an absolute amount in paise
  'percent'     -- value is basis points, so 1000 = 10%
);

create type access_method as enum (
  'open_access',
  'host_greets',
  'qr_code',
  'pin_code',
  'remote_gate',
  'smart_lock',
  'plate_recognition'
);

-- =============================================================================
-- Shared helper functions
-- =============================================================================

-- Standard updated_at trigger.
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Great-circle distance in metres. We deliberately do not require PostGIS: the
-- free Supabase tier has it available, but keeping the schema to core Postgres
-- means the whole thing also runs on any plain Postgres, including a local
-- container, with no extension negotiation. At city scale the haversine formula
-- against a bounding-box prefilter is comfortably fast enough, and 0006 adds the
-- supporting indexes.
create or replace function earth_distance_m(
  lat1 double precision,
  lng1 double precision,
  lat2 double precision,
  lng2 double precision
)
returns double precision
language sql
immutable
parallel safe
as $$
  select 6371000 * 2 * asin(
    sqrt(
      power(sin(radians(lat2 - lat1) / 2), 2) +
      cos(radians(lat1)) * cos(radians(lat2)) *
      power(sin(radians(lng2 - lng1) / 2), 2)
    )
  );
$$;

-- Degrees of latitude per metre, and the longitude equivalent at a given latitude.
-- Used to build the cheap bounding box that precedes the exact distance filter.
create or replace function lat_degrees_per_m()
returns double precision
language sql
immutable
parallel safe
as $$ select 1.0 / 111320.0; $$;

create or replace function lng_degrees_per_m(at_lat double precision)
returns double precision
language sql
immutable
parallel safe
as $$
  select 1.0 / greatest(111320.0 * cos(radians(at_lat)), 1.0);
$$;

-- A short, human-speakable, unambiguous booking code: PS-XXXXXX using an alphabet
-- with no 0/O or 1/I/L confusion, because these get read aloud to security guards.
create or replace function generate_booking_code()
returns text
language plpgsql
volatile
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  result text := '';
  i integer;
begin
  for i in 1..6 loop
    result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return 'PS-' || result;
end;
$$;

comment on extension btree_gist is
  'Required by the bookings_no_overlap exclusion constraint: lets a GiST index mix scalar equality with range overlap.';
