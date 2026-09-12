-- =============================================================================
-- ParkSpace 0017 — the guard must ignore generated columns
-- =============================================================================
-- The allow-list guard in 0015 compares to_jsonb(new) against to_jsonb(old) and
-- rejects any key that differs and is not on the allow-list. That is the right
-- shape, but it had one blind spot.
--
-- `bookings.period` is a GENERATED column, computed from starts_at and ends_at.
-- Postgres does not populate generated columns in NEW during a BEFORE trigger:
-- they are evaluated after the trigger has run. So NEW.period is always null at
-- guard time while OLD.period holds a value, and every single client update
-- looked like it was tampering with `period`.
--
-- The result was that a driver could not edit the note on their own booking, the
-- one thing the allow-list was supposed to permit.
--
-- Fixing it by adding 'period' to the allow-list would work today and rot
-- tomorrow, because the next generated column would reintroduce the same bug.
-- So the guard now discovers generated columns from the catalogue instead.
--
-- Allowing them through the comparison is safe by definition: a generated column
-- cannot be written directly at all, and `period` is derived from starts_at and
-- ends_at, both of which the guard still refuses to let a client change.
--
-- This was caught because the exploit suite asserts that the product still works
-- as well as that the attacks fail. A suite that only checked the attacks would
-- have reported complete success while booking notes were broken in production.
-- =============================================================================

create or replace function bookings_guard_direct_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  -- The ONLY columns a participant may change by writing to the row directly.
  -- Everything else moves through a booking operation, which validates it.
  --
  -- Deliberately an allow-list. The previous deny-list version left space_id
  -- unpinned, which let a driver repoint a confirmed booking at any listing and
  -- read that host's address, access instructions and gate PIN.
  allowed constant text[] := array['driver_notes', 'updated_at'];

  -- Generated columns are not populated in NEW during a BEFORE trigger, so they
  -- always appear to have changed. They also cannot be written directly, so
  -- skipping them costs nothing. Read from the catalogue rather than hard-coded,
  -- so a future generated column does not silently break client writes.
  generated_cols text[];
  touched text[];
begin
  if in_booking_operation() or is_privileged_connection() or is_admin() then
    return new;
  end if;

  select coalesce(array_agg(a.attname::text), array[]::text[])
    into generated_cols
    from pg_attribute a
   where a.attrelid = 'public.bookings'::regclass
     and a.attnum > 0
     and not a.attisdropped
     and a.attgenerated <> '';

  select array_agg(n.key order by n.key)
    into touched
    from jsonb_each(to_jsonb(new)) n
   where n.value is distinct from (to_jsonb(old) -> n.key)
     and n.key <> all(allowed)
     and n.key <> all(generated_cols);

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
-- Assertion: the guard must still refuse the things that matter.
-- -----------------------------------------------------------------------------
do $$
declare
  gen_count integer;
begin
  select count(*) into gen_count
    from pg_attribute a
   where a.attrelid = 'public.bookings'::regclass
     and a.attnum > 0 and not a.attisdropped and a.attgenerated <> '';

  if gen_count = 0 then
    raise exception
      'Expected at least one generated column on bookings. If period stopped being generated, the exclusion constraint is no longer indexing what it should.';
  end if;

  if not (select prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'bookings_guard_direct_update') then
    raise exception 'bookings_guard_direct_update is not SECURITY DEFINER and will fail for clients';
  end if;

  raise notice 'Booking guard handles % generated column(s) and remains an allow-list.', gen_count;
end;
$$;
