-- =============================================================================
-- ParkSpace 0018 — the coordinate jitter was fully invertible
-- =============================================================================
-- The single worst finding of the audit, because it silently defeated the
-- product's headline privacy claim while every test for that claim passed.
--
-- THE BUG
--
-- 0003 derived the jitter offset from the listing's own id:
--
--     seed       := ('x' || substr(md5(new.id::text), 1, 8))::bit(32)::bigint / 4294967296.0;
--     bearing    := 2 * pi() * seed;
--     distance_m := 80 + 70 * (('x' || substr(md5(new.id::text), 9, 8))::bit(32)::bigint / 4294967296.0);
--
-- The reasoning at the time was that a deterministic offset keeps the public pin
-- from wandering between page loads, which is true and still matters. What it
-- missed is that `id` is public. It is in every search result, every listing
-- URL and every sitemap entry.
--
-- So the offset is not a secret. Anyone can take a listing id, recompute exactly
-- those three lines, and subtract the result from the published approximate
-- coordinate to recover the host's true position. Confirmed against the live
-- database before writing this: the seed derived from the public id reproduces
-- the stored offset exactly.
--
-- Every layer built on top of this held. The grants held, the view held, the
-- has_address_access check held. It did not matter, because the protected value
-- was reconstructible from the unprotected one using published information.
--
-- THE FIX
--
-- Generate the offset from a cryptographically random source at insert time and
-- store the resulting point. It is then stable for the life of the listing, so
-- the pin still never wanders, but there is nothing to invert: the offset exists
-- only in parking_spaces, which no client role can SELECT.
--
-- Every existing row is re-jittered, because every existing offset is already
-- compromised.
--
-- The lesson is worth writing down: deriving a secret from a public identifier
-- does not make it secret, however good the hash is. md5 was never the weakness.
-- =============================================================================

create or replace function apply_location_jitter()
returns trigger
language plpgsql
as $$
declare
  bearing     double precision;
  distance_m  double precision;
  d_lat       double precision;
  d_lng       double precision;
begin
  -- Keep the existing offset when the true coordinate has not moved, so the
  -- public pin stays put. This is the property the original design wanted, and
  -- it is preserved: stability comes from storing the result, not from being
  -- able to recompute it.
  if tg_op = 'UPDATE'
     and new.approx_lat is not null
     and new.lat is not distinct from old.lat
     and new.lng is not distinct from old.lng then
    return new;
  end if;

  -- Cryptographically random, not derived from anything a visitor can see.
  -- gen_random_bytes comes from pgcrypto, installed in 0001.
  bearing := 2 * pi() * (
    ('x' || encode(gen_random_bytes(4), 'hex'))::bit(32)::bigint / 4294967296.0
  );

  distance_m := 80 + 70 * (
    ('x' || encode(gen_random_bytes(4), 'hex'))::bit(32)::bigint / 4294967296.0
  );

  d_lat := (distance_m * cos(bearing)) * lat_degrees_per_m();
  d_lng := (distance_m * sin(bearing)) * lng_degrees_per_m(new.lat);

  new.approx_lat := round((new.lat + d_lat)::numeric, 6)::double precision;
  new.approx_lng := round((new.lng + d_lng)::numeric, 6)::double precision;

  return new;
end;
$$;

comment on function apply_location_jitter is
  'Offsets the published coordinate by a random 80-150 m. The offset is random, not derived from the row id: deriving it from a public identifier made it trivially invertible.';

-- -----------------------------------------------------------------------------
-- Re-jitter every existing listing. All current offsets are compromised.
-- -----------------------------------------------------------------------------
do $$
declare
  r record;
  bearing     double precision;
  distance_m  double precision;
  d_lat       double precision;
  d_lng       double precision;
  n integer := 0;
begin
  for r in select id, lat, lng from parking_spaces loop
    bearing := 2 * pi() * (
      ('x' || encode(gen_random_bytes(4), 'hex'))::bit(32)::bigint / 4294967296.0
    );
    distance_m := 80 + 70 * (
      ('x' || encode(gen_random_bytes(4), 'hex'))::bit(32)::bigint / 4294967296.0
    );

    d_lat := (distance_m * cos(bearing)) * lat_degrees_per_m();
    d_lng := (distance_m * sin(bearing)) * lng_degrees_per_m(r.lat);

    update parking_spaces
       set approx_lat = round((r.lat + d_lat)::numeric, 6)::double precision,
           approx_lng = round((r.lng + d_lng)::numeric, 6)::double precision
     where id = r.id;

    n := n + 1;
  end loop;

  raise notice 'Re-jittered % listing(s) with unguessable offsets.', n;
end;
$$;

-- -----------------------------------------------------------------------------
-- Assertion: the published point must no longer match the derivable one.
-- -----------------------------------------------------------------------------
do $$
declare
  reproducible integer;
begin
  -- Recompute the OLD algorithm for every row and count how many still land on
  -- the stored public coordinate. Any match means a row was not re-jittered.
  select count(*)
    into reproducible
    from parking_spaces ps
   cross join lateral (
     select
       2 * pi() * (('x' || substr(md5(ps.id::text), 1, 8))::bit(32)::bigint / 4294967296.0) as bearing,
       80 + 70 * (('x' || substr(md5(ps.id::text), 9, 8))::bit(32)::bigint / 4294967296.0) as dist
   ) old_algo
   where ps.approx_lat is not null
     and abs(
           ps.approx_lat -
           round((ps.lat + (old_algo.dist * cos(old_algo.bearing)) * lat_degrees_per_m())::numeric, 6)::double precision
         ) < 0.0000005;

  if reproducible > 0 then
    raise exception
      'Location privacy: % listing(s) still have a published coordinate reproducible from their public id.',
      reproducible;
  end if;

  -- And the offset must still be within the documented 80 to 150 m band, or the
  -- map is either useless or misleading.
  select count(*)
    into reproducible
    from parking_spaces ps
   where ps.approx_lat is not null
     and (earth_distance_m(ps.lat, ps.lng, ps.approx_lat, ps.approx_lng) < 70
          or earth_distance_m(ps.lat, ps.lng, ps.approx_lat, ps.approx_lng) > 160);

  if reproducible > 0 then
    raise exception
      'Jitter distance out of band on % listing(s); expected roughly 80 to 150 m.', reproducible;
  end if;

  raise notice 'Published coordinates are no longer derivable, and all offsets sit in the 80 to 150 m band.';
end;
$$;
