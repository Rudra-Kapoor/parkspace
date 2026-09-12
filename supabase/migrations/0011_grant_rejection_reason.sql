-- =============================================================================
-- ParkSpace 0011 — let a host read why their listing was rejected
-- =============================================================================
-- 0008 revoked blanket SELECT on parking_spaces and granted an explicit column
-- list instead, which is the mechanism that makes the location privacy rule
-- structural. Three columns were left out of that list by oversight rather than
-- by design:
--
--   rejection_reason   the moderator's explanation
--   reviewed_at        when it was reviewed
--   slug               already public through the view
--
-- The effect was that a host whose listing was rejected could see the rejected
-- badge but not the reason for it, which is the one piece of information that
-- would let them fix it. The host dashboard worked around this with a separate
-- best-effort query and generic fallback copy.
--
-- These three are safe to grant. None of them is a location field, and RLS still
-- restricts the rows a host can see to their own listings.
--
-- The columns that stay revoked are the ones that matter, and they are listed
-- here so a future reader can see the omission was deliberate:
--
--   address_line, landmark, lat, lng, access_instructions, access_pin
--
-- Those reach a driver only through public_spaces, gated on has_address_access.
-- =============================================================================

grant select (rejection_reason, reviewed_at, slug)
  on parking_spaces to authenticated;

-- A quick self-check. If this ever returns a row, the privacy grant has been
-- widened by accident and the location rule is no longer structural.
do $$
declare
  leaked text;
begin
  select string_agg(a.attname, ', ')
    into leaked
    from pg_attribute a
   where a.attrelid = 'public.parking_spaces'::regclass
     and a.attnum > 0
     and not a.attisdropped
     and a.attname in ('address_line', 'landmark', 'lat', 'lng',
                       'access_instructions', 'access_pin')
     and has_column_privilege('authenticated', a.attrelid, a.attnum, 'SELECT');

  if leaked is not null then
    raise exception
      'Location privacy breach: the authenticated role can read % on parking_spaces. '
      'These must only be reachable through the public_spaces view.', leaked;
  end if;

  raise notice 'Location privacy check passed: no exact-location column is readable by the authenticated role.';
end;
$$;
