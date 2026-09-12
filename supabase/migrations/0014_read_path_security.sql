-- =============================================================================
-- ParkSpace 0014 — fix the read path, which was broken for every real user
-- =============================================================================
-- Deploying and then calling the live site as an ordinary visitor found two
-- bugs. Both were invisible from the SQL editor, because the SQL editor connects
-- as an owner and an owner is exempt from everything that was wrong.
--
-- BUG 1: search returned HTTP 500 for everyone.
--
--   Migration 0008 revoked SELECT on parking_spaces from anon and authenticated,
--   which is the mechanism that makes the location privacy rule structural.
--   But search_spaces() was left SECURITY INVOKER, so it executed with the
--   caller's privileges and hit the very revoke that was meant to protect the
--   table. Every search failed with permission denied.
--
-- BUG 2, which is the serious one: availability was silently wrong.
--
--   count_free_bays() and next_free_bay() read the bookings table and were also
--   SECURITY INVOKER. Row Level Security on bookings restricts a caller to their
--   own bookings, so for any driver looking at somebody else's space the
--   subquery matched ZERO rows and the space was reported as completely free.
--
--   A fully booked space would have shown as available in search, on the listing
--   page and in the date picker. The driver would then have been refused at the
--   final insert by the exclusion constraint. The guarantee would have held, so
--   nobody would ever have been double-booked, but the product would have been
--   confidently advertising parking it could not sell.
--
--   This is the failure mode the constraint cannot protect against, because the
--   constraint is the last line and this was wrong at the first.
--
-- THE FIX
--
--   The read-path functions become SECURITY DEFINER with a locked search_path.
--   This is safe, and deliberately so: each one returns either an aggregate or a
--   privacy-safe projection, never a row from a protected table. The list below
--   states what each one can and cannot reveal, so a future reader can check the
--   reasoning rather than trusting it.
--
--   set search_path = public is not optional on a SECURITY DEFINER function. A
--   caller who can create objects in an earlier schema on the path could
--   otherwise shadow a table or an operator and have the function run their code
--   with the definer's rights.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- search_spaces
--   Returns: title, locality, city, approximate coordinate, price, rating.
--   Cannot return: address_line, landmark, the true lat/lng, access
--   instructions or the access pin. None of those columns appear in its RETURNS
--   TABLE clause, so the privacy rule is enforced by the function's shape rather
--   than by its privileges.
--   Own filter: status = 'active', so it can never surface a draft or a
--   delisted space even though it now bypasses RLS.
-- -----------------------------------------------------------------------------
alter function search_spaces(
  double precision, double precision, integer, timestamptz, timestamptz,
  vehicle_type, bigint, space_type[], text[], numeric, boolean, boolean,
  text, integer, integer
) security definer;

alter function search_spaces(
  double precision, double precision, integer, timestamptz, timestamptz,
  vehicle_type, bigint, space_type[], text[], numeric, boolean, boolean,
  text, integer, integer
) set search_path = public;

-- -----------------------------------------------------------------------------
-- price_quote_paise
--   Returns: one bigint, the price of a stay. Reveals nothing about any booking
--   or any other user.
-- -----------------------------------------------------------------------------
alter function price_quote_paise(uuid, timestamptz, timestamptz) security definer;
alter function price_quote_paise(uuid, timestamptz, timestamptz) set search_path = public;

-- -----------------------------------------------------------------------------
-- is_space_available
--   Returns: one boolean. This is the question a driver is entitled to ask about
--   any listed space, and answering it honestly requires seeing bookings the
--   driver cannot read. It reveals occupancy, not who occupies it.
-- -----------------------------------------------------------------------------
alter function is_space_available(uuid, timestamptz, timestamptz) security definer;
alter function is_space_available(uuid, timestamptz, timestamptz) set search_path = public;

-- -----------------------------------------------------------------------------
-- count_free_bays and next_free_bay
--   Return: an integer count and a bay index. No booking id, no driver, no
--   times, no amounts. A driver learns that three of eight bays are taken, which
--   is precisely what they need and nothing more.
-- -----------------------------------------------------------------------------
alter function count_free_bays(uuid, timestamptz, timestamptz, uuid) security definer;
alter function count_free_bays(uuid, timestamptz, timestamptz, uuid) set search_path = public;

alter function next_free_bay(uuid, timestamptz, timestamptz) security definer;
alter function next_free_bay(uuid, timestamptz, timestamptz) set search_path = public;

-- -----------------------------------------------------------------------------
-- is_within_availability_rules
--   Returns: one boolean, derived from the host's own published opening hours.
-- -----------------------------------------------------------------------------
alter function is_within_availability_rules(uuid, timestamptz, timestamptz, text) security definer;
alter function is_within_availability_rules(uuid, timestamptz, timestamptz, text) set search_path = public;

-- -----------------------------------------------------------------------------
-- space_availability_calendar
--   Returns: per-day bay counts for one space. Same class of information as
--   is_space_available, in bulk, and it is what the date picker greys out.
-- -----------------------------------------------------------------------------
alter function space_availability_calendar(uuid, date, date) security definer;
alter function space_availability_calendar(uuid, date, date) set search_path = public;

-- -----------------------------------------------------------------------------
-- Lock down the anon role's table-level reach.
-- -----------------------------------------------------------------------------
-- anon still had table-level SELECT on bookings. RLS meant it returned no rows,
-- so nothing leaked, but a privilege that exists only because a policy happens
-- to be correct is a privilege waiting to become a bug. anon has no legitimate
-- reason to touch these tables directly: everything it needs comes through the
-- functions above or the public_spaces view.
revoke select on bookings from anon;
revoke select on booking_events from anon;
revoke select on payments from anon;
revoke select on refunds from anon;
revoke select on payouts from anon;
revoke select on messages from anon;
revoke select on disputes from anon;
revoke select on vehicles from anon;
revoke select on profiles from anon;
revoke select on wallet_transactions from anon;
revoke select on notifications from anon;
revoke select on verification_documents from anon;

-- -----------------------------------------------------------------------------
-- Assertions. If any of these fail the migration aborts, which is the point.
-- -----------------------------------------------------------------------------
do $$
declare
  bad text;
begin
  -- Every client-callable read function must now be definer with a fixed path.
  select string_agg(p.proname, ', ')
    into bad
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in (
       'search_spaces', 'price_quote_paise', 'is_space_available',
       'count_free_bays', 'next_free_bay', 'space_availability_calendar',
       'is_within_availability_rules'
     )
     and (not p.prosecdef or p.proconfig is null
          or not ('search_path=public' = any(p.proconfig)));

  if bad is not null then
    raise exception
      'These read-path functions are not SECURITY DEFINER with a locked search_path: %', bad;
  end if;

  -- And the privacy rule must still hold.
  select string_agg(a.attname, ', ')
    into bad
    from pg_attribute a
   where a.attrelid = 'public.parking_spaces'::regclass
     and a.attnum > 0
     and not a.attisdropped
     and a.attname in ('address_line', 'landmark', 'lat', 'lng',
                       'access_instructions', 'access_pin')
     and (has_column_privilege('authenticated', a.attrelid, a.attnum, 'SELECT')
          or has_column_privilege('anon', a.attrelid, a.attnum, 'SELECT'));

  if bad is not null then
    raise exception
      'Location privacy breach: a client role can read % on parking_spaces.', bad;
  end if;

  raise notice 'Read path secured, and the location privacy rule still holds.';
end;
$$;
