-- =============================================================================
-- ParkSpace 0012 — close two gaps found reviewing the code against the docs
-- =============================================================================
-- GAP 1: the next-block-up price cap only applied to one rate combination.
--
--   price_quote_paise caps the total so that a sub-day stay never costs more
--   than a day. The check was written as `if hourly is not null and daily is not
--   null`, so a space priced daily and monthly was uncapped: a 29 day stay could
--   be quoted 29 daily rates when the monthly rate was cheaper, and the driver
--   would be charged more for booking through us than the host's own board says.
--
--   The cap is now computed for every pair the host actually offers.
--
-- GAP 2: trust_score never moved.
--
--   recompute_trust_score() was written and granted but called by nothing, so
--   every profile sat at the default 50 forever while the search ranking and the
--   admin screens presented it as meaningful. A number shown to an operator that
--   is secretly a constant is worse than no number.
--
--   It is now recomputed when a booking reaches a terminal state.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Gap 1: cap against every offered rate
-- -----------------------------------------------------------------------------
create or replace function price_quote_paise(
  p_space_id  uuid,
  p_starts_at timestamptz,
  p_ends_at   timestamptz
)
returns bigint
language plpgsql
stable
as $$
declare
  s parking_spaces%rowtype;
  total_minutes  integer;
  months         integer := 0;
  days           integer := 0;
  hours          integer := 0;
  remaining      integer;
  best           bigint;
  multiplier_bp  integer := 10000;

  minutes_per_day   constant integer := 24 * 60;
  minutes_per_month constant integer := 30 * 24 * 60;
begin
  select * into s from parking_spaces where id = p_space_id;
  if not found then
    return null;
  end if;

  total_minutes := ceil(extract(epoch from (p_ends_at - p_starts_at)) / 60.0);
  if total_minutes <= 0 then
    return null;
  end if;

  remaining := total_minutes;

  -- Greedy decomposition: the largest block the host offers, then the next.
  if s.price_monthly_paise is not null then
    months := remaining / minutes_per_month;
    remaining := remaining - months * minutes_per_month;
  end if;

  if s.price_daily_paise is not null then
    days := remaining / minutes_per_day;
    remaining := remaining - days * minutes_per_day;
  end if;

  if s.price_hourly_paise is not null then
    hours := ceil(remaining / 60.0);
    remaining := 0;
  elsif remaining > 0 and s.price_daily_paise is not null then
    days := days + 1;
    remaining := 0;
  elsif remaining > 0 and s.price_monthly_paise is not null then
    months := months + 1;
    remaining := 0;
  end if;

  best := coalesce(months * s.price_monthly_paise, 0)
        + coalesce(days   * s.price_daily_paise, 0)
        + coalesce(hours  * s.price_hourly_paise, 0);

  -- ---------------------------------------------------------------------------
  -- The cap. For every rate the host offers, work out what the whole stay would
  -- cost if it were billed entirely in that unit, and never charge more than the
  -- cheapest of those. This is what stops 23 hours costing more than a day, and
  -- now also stops 29 days costing more than a month.
  --
  -- Computed against every rate rather than one pair, because the earlier version
  -- silently exempted daily-plus-monthly listings.
  -- ---------------------------------------------------------------------------
  if s.price_hourly_paise is not null then
    best := least(best, ceil(total_minutes / 60.0)::bigint * s.price_hourly_paise);
  end if;

  if s.price_daily_paise is not null then
    best := least(best, ceil(total_minutes::numeric / minutes_per_day)::bigint * s.price_daily_paise);
  end if;

  if s.price_monthly_paise is not null then
    best := least(best, ceil(total_minutes::numeric / minutes_per_month)::bigint * s.price_monthly_paise);
  end if;

  select max(po.multiplier_bp) into multiplier_bp
    from price_overrides po
   where po.space_id = p_space_id
     and po.period && tstzrange(p_starts_at, p_ends_at, '[)');

  best := (best * coalesce(multiplier_bp, 10000)) / 10000;

  return greatest(best, 0);
end;
$$;

grant execute on function price_quote_paise(uuid, timestamptz, timestamptz) to anon, authenticated;

comment on function price_quote_paise is
  'Cheapest legitimate combination of the rates the host offers, capped so the stay never costs more than billing it entirely in any single offered unit.';

-- -----------------------------------------------------------------------------
-- Gap 2: actually recompute trust
-- -----------------------------------------------------------------------------
create or replace function bookings_refresh_trust()
returns trigger
language plpgsql
as $$
begin
  if new.status in ('completed', 'cancelled', 'no_show')
     and old.status is distinct from new.status then
    perform recompute_trust_score(new.driver_id);
    perform recompute_trust_score(new.host_id);
  end if;
  return null;
end;
$$;

drop trigger if exists bookings_trust on bookings;
create trigger bookings_trust
  after update of status on bookings
  for each row execute function bookings_refresh_trust();

-- A review changes the subject's average, so it changes their trust score too.
create or replace function reviews_refresh_trust()
returns trigger
language plpgsql
as $$
begin
  perform recompute_trust_score(new.subject_id);
  return null;
end;
$$;

drop trigger if exists reviews_trust on reviews;
create trigger reviews_trust
  after insert or update of is_published on reviews
  for each row execute function reviews_refresh_trust();

-- -----------------------------------------------------------------------------
-- While here: cancellation_count_90d was a lifetime count despite its name
-- -----------------------------------------------------------------------------
-- The counter only ever incremented, so a host who cancelled twice in their first
-- month carried it forever and their Superhost eligibility never recovered. The
-- name promised a rolling window, so make it one rather than renaming the column
-- and keeping the unforgiving behaviour.
create or replace function refresh_host_cancellation_windows()
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  n integer;
begin
  with counts as (
    select b.host_id, count(*)::integer as recent
      from bookings b
     where b.status = 'cancelled'
       and b.cancelled_by = 'host'
       and b.cancelled_at > now() - interval '90 days'
     group by b.host_id
  ),
  updated as (
    update host_profiles hp
       set cancellation_count_90d = coalesce(c.recent, 0)
      from (select user_id from host_profiles) all_hosts
      left join counts c on c.host_id = all_hosts.user_id
     where hp.user_id = all_hosts.user_id
    returning 1
  )
  select count(*) into n from updated;
  return n;
end;
$$;

revoke execute on function refresh_host_cancellation_windows() from anon, authenticated;

comment on function refresh_host_cancellation_windows is
  'Recomputes the rolling 90 day host cancellation count. Run from the scheduled job. The counter previously only incremented, so it was a lifetime total wearing a 90 day name.';
