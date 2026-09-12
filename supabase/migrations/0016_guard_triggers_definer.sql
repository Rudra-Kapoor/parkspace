-- =============================================================================
-- ParkSpace 0016 — let the guard triggers call their own helpers
-- =============================================================================
-- 0015 revoked EXECUTE on is_privileged_connection() and in_booking_operation()
-- from the client roles, along with the genuinely dangerous functions. That went
-- one step too far.
--
-- A trigger function runs with the privileges of whoever performed the
-- operation, not the privileges of whoever wrote the trigger. So when a driver
-- edited the note on their own booking, the guard trigger fired as that driver
-- and could not call the very helpers it uses to decide whether to allow the
-- edit. The write failed with "permission denied for function
-- is_privileged_connection".
--
-- Caught by the exploit test suite, which deliberately asserts that the fix did
-- not break the product as well as that the attacks are dead. Without that
-- second half the regression would have shipped.
--
-- Two ways to fix it. Granting the helpers back to every client role would work,
-- and they are only boolean predicates over session state, so it would even be
-- safe. But it widens the surface for no reason.
--
-- Instead the guard triggers themselves become SECURITY DEFINER. They then run
-- with the owner's rights and can reach their helpers, while the answers those
-- helpers give are unchanged: is_privileged_connection() reads the JWT claims of
-- the real session and is_admin() reads auth.uid(), and neither is affected by
-- whose privileges the function body runs under. The guard still sees the actual
-- caller. It simply stops being blocked from asking.
--
-- begin_booking_operation() stays revoked from every client role. That is the
-- one that actually confers a capability, and it is the whole point of the
-- marker: a guard a client can disarm is not a guard.
-- =============================================================================

alter function bookings_guard_direct_update() security definer;
alter function bookings_guard_direct_update() set search_path = public;

alter function profiles_guard_privileged_columns() security definer;
alter function profiles_guard_privileged_columns() set search_path = public;

alter function host_profiles_guard_columns() security definer;
alter function host_profiles_guard_columns() set search_path = public;

alter function spaces_guard_columns() security definer;
alter function spaces_guard_columns() set search_path = public;

-- The message redaction trigger reads nothing privileged, but pin its path too:
-- a SECURITY DEFINER function is not the only thing that benefits from not
-- resolving its operators through a caller-controlled search_path.
alter function messages_redact_contacts() set search_path = public;

-- -----------------------------------------------------------------------------
-- Assertions
-- -----------------------------------------------------------------------------
do $$
declare
  bad text;
begin
  -- The guards must be definer with a locked path, or a client write fails.
  select string_agg(p.proname, ', ' order by p.proname)
    into bad
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in (
       'bookings_guard_direct_update', 'profiles_guard_privileged_columns',
       'host_profiles_guard_columns', 'spaces_guard_columns'
     )
     and (not p.prosecdef
          or p.proconfig is null
          or not ('search_path=public' = any(p.proconfig)));

  if bad is not null then
    raise exception 'These guard triggers are not SECURITY DEFINER with a locked search_path: %', bad;
  end if;

  -- And the marker must still be unreachable from a browser.
  if has_function_privilege('authenticated', 'public.begin_booking_operation()', 'EXECUTE')
     or has_function_privilege('anon', 'public.begin_booking_operation()', 'EXECUTE') then
    raise exception 'begin_booking_operation is callable by a client, so the booking guard can be disarmed';
  end if;

  if has_function_privilege('authenticated', 'public.confirm_booking(uuid,uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.confirm_booking(uuid,uuid)', 'EXECUTE') then
    raise exception 'confirm_booking is callable by a client, so bookings can be confirmed without payment';
  end if;

  raise notice 'Guard triggers can reach their helpers, and the dangerous functions stay private.';
end;
$$;
