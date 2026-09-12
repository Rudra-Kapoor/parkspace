-- =============================================================================
-- ParkSpace 0006 — the availability engine, pricing and search
-- =============================================================================
-- Availability is answered in one place and one place only. The UI, the quote
-- endpoint and the booking endpoint all call the same function, so they cannot
-- disagree about whether a space is free.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- is_within_availability_rules
-- -----------------------------------------------------------------------------
-- A booking must sit entirely inside the host's declared weekly windows. The
-- interval may span several days, so we walk it day by day in the space's local
-- timezone and confirm every minute is covered.
--
-- Walking day by day rather than doing clever range arithmetic keeps this
-- readable, and the interval is bounded by MAX_BOOKING_DAYS so the loop is too.
create or replace function is_within_availability_rules(
  p_space_id  uuid,
  p_starts_at timestamptz,
  p_ends_at   timestamptz,
  p_timezone  text default 'Asia/Kolkata'
)
returns boolean
language plpgsql
stable
as $$
declare
  rule_count    integer;
  cursor_ts     timestamptz := p_starts_at;
  local_day     date;
  dow           smallint;
  covered_until timestamptz;
  found         boolean;
  r             record;
begin
  select count(*) into rule_count
    from availability_rules where space_id = p_space_id;

  -- No rules declared means always available. This is the deliberate default for
  -- a host who just wants the space bookable around the clock.
  if rule_count = 0 then
    return true;
  end if;

  while cursor_ts < p_ends_at loop
    local_day := (cursor_ts at time zone p_timezone)::date;
    dow := extract(dow from local_day)::smallint;
    found := false;

    for r in
      select start_time, end_time, ends_next_day
        from availability_rules
       where space_id = p_space_id and day_of_week = dow
       order by start_time
    loop
      declare
        win_start timestamptz;
        win_end   timestamptz;
      begin
        win_start := (local_day + r.start_time) at time zone p_timezone;
        win_end   := (local_day + r.end_time
                       + case when r.ends_next_day then interval '1 day' else interval '0' end)
                     at time zone p_timezone;

        if cursor_ts >= win_start and cursor_ts < win_end then
          covered_until := win_end;
          found := true;
          exit;
        end if;
      end;
    end loop;

    -- Also consider a window opened by the previous day that runs past midnight.
    if not found then
      for r in
        select start_time, end_time
          from availability_rules
         where space_id = p_space_id
           and day_of_week = ((dow + 6) % 7)::smallint
           and ends_next_day
      loop
        declare
          win_start timestamptz := ((local_day - 1) + r.start_time) at time zone p_timezone;
          win_end   timestamptz := ((local_day - 1) + r.end_time + interval '1 day') at time zone p_timezone;
        begin
          if cursor_ts >= win_start and cursor_ts < win_end then
            covered_until := win_end;
            found := true;
            exit;
          end if;
        end;
      end loop;
    end if;

    if not found then
      return false;
    end if;

    cursor_ts := covered_until;
  end loop;

  return true;
end;
$$;

-- -----------------------------------------------------------------------------
-- count_free_bays
-- -----------------------------------------------------------------------------
-- How many bays of a space are unclaimed for the whole requested interval.
-- Note it counts DISTINCT bay_index of live bookings that overlap, which is the
-- correct question: a bay is unusable if it is taken for any part of the window.
create or replace function count_free_bays(
  p_space_id  uuid,
  p_starts_at timestamptz,
  p_ends_at   timestamptz,
  p_exclude_booking uuid default null
)
returns integer
language sql
stable
as $$
  select greatest(
    ps.capacity - (
      select count(distinct b.bay_index)
        from bookings b
       where b.space_id = p_space_id
         and b.status in ('pending', 'confirmed', 'active')
         and b.period && tstzrange(p_starts_at, p_ends_at, '[)')
         and (p_exclude_booking is null or b.id <> p_exclude_booking)
    ),
    0
  )::integer
  from parking_spaces ps
  where ps.id = p_space_id;
$$;

-- -----------------------------------------------------------------------------
-- next_free_bay
-- -----------------------------------------------------------------------------
-- Returns the lowest bay index that is free for the interval, or null.
create or replace function next_free_bay(
  p_space_id  uuid,
  p_starts_at timestamptz,
  p_ends_at   timestamptz
)
returns smallint
language sql
stable
as $$
  select gs::smallint
    from parking_spaces ps,
         generate_series(0, ps.capacity - 1) gs
   where ps.id = p_space_id
     and not exists (
       select 1 from bookings b
        where b.space_id = p_space_id
          and b.bay_index = gs
          and b.status in ('pending', 'confirmed', 'active')
          and b.period && tstzrange(p_starts_at, p_ends_at, '[)')
     )
   order by gs
   limit 1;
$$;

-- -----------------------------------------------------------------------------
-- is_space_available — the single source of truth
-- -----------------------------------------------------------------------------
create or replace function is_space_available(
  p_space_id  uuid,
  p_starts_at timestamptz,
  p_ends_at   timestamptz
)
returns boolean
language plpgsql
stable
as $$
declare
  s parking_spaces%rowtype;
  duration_minutes integer;
begin
  select * into s from parking_spaces where id = p_space_id;
  if not found or s.status <> 'active' then
    return false;
  end if;

  if p_ends_at <= p_starts_at then
    return false;
  end if;

  duration_minutes := extract(epoch from (p_ends_at - p_starts_at)) / 60;

  if duration_minutes < s.min_booking_minutes then
    return false;
  end if;

  if s.max_booking_minutes is not null and duration_minutes > s.max_booking_minutes then
    return false;
  end if;

  -- Notice period: the host needs warning before a car turns up.
  if p_starts_at < now() + make_interval(mins => s.min_notice_minutes) then
    return false;
  end if;

  -- Booking horizon.
  if p_starts_at > now() + make_interval(days => s.max_advance_days) then
    return false;
  end if;

  -- Host blackout.
  if exists (
    select 1 from availability_blocks ab
     where ab.space_id = p_space_id
       and ab.period && tstzrange(p_starts_at, p_ends_at, '[)')
  ) then
    return false;
  end if;

  -- Weekly availability pattern.
  if not is_within_availability_rules(p_space_id, p_starts_at, p_ends_at) then
    return false;
  end if;

  -- And finally, is there a bay left.
  return count_free_bays(p_space_id, p_starts_at, p_ends_at) > 0;
end;
$$;

-- -----------------------------------------------------------------------------
-- price_quote_paise — the base amount before fees, coupons and tax
-- -----------------------------------------------------------------------------
-- Chooses the cheapest legitimate combination of the host's declared rates. A
-- driver booking 26 hours on a space priced both hourly and daily should pay for
-- one day plus two hours, not twenty-six hours, and must never pay more than the
-- daily rate for a sub-day stay.
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
  hourly_only    bigint;
  multiplier_bp  integer := 10000;
begin
  select * into s from parking_spaces where id = p_space_id;
  if not found then
    return null;
  end if;

  total_minutes := ceil(extract(epoch from (p_ends_at - p_starts_at)) / 60.0);
  remaining := total_minutes;

  -- Monthly blocks first, then daily, then hourly, each only if the host offers it.
  if s.price_monthly_paise is not null then
    months := remaining / (30 * 24 * 60);
    remaining := remaining - months * (30 * 24 * 60);
  end if;

  if s.price_daily_paise is not null then
    days := remaining / (24 * 60);
    remaining := remaining - days * (24 * 60);
  end if;

  if s.price_hourly_paise is not null then
    hours := ceil(remaining / 60.0);
    remaining := 0;
  elsif remaining > 0 and s.price_daily_paise is not null then
    -- No hourly rate offered, so the tail rounds up to a full day.
    days := days + 1;
    remaining := 0;
  elsif remaining > 0 and s.price_monthly_paise is not null then
    months := months + 1;
    remaining := 0;
  end if;

  best := coalesce(months * s.price_monthly_paise, 0)
        + coalesce(days   * s.price_daily_paise, 0)
        + coalesce(hours  * s.price_hourly_paise, 0);

  -- Never charge more than the next block up. Twenty-three hours on a space with
  -- both rates must not exceed the daily price.
  if s.price_hourly_paise is not null and s.price_daily_paise is not null then
    hourly_only := ceil(total_minutes / 60.0)::bigint * s.price_hourly_paise;
    best := least(
      best,
      hourly_only,
      (ceil(total_minutes / (24.0 * 60.0))::bigint) * s.price_daily_paise
    );
  end if;

  -- Apply the largest overlapping price override, if any.
  select max(multiplier_bp) into multiplier_bp
    from price_overrides po
   where po.space_id = p_space_id
     and po.period && tstzrange(p_starts_at, p_ends_at, '[)');

  best := (best * coalesce(multiplier_bp, 10000)) / 10000;

  return greatest(best, 0);
end;
$$;

-- -----------------------------------------------------------------------------
-- search_spaces — the query behind the map
-- -----------------------------------------------------------------------------
-- Returns only privacy-safe fields. The exact coordinate and the address line are
-- never selected here, so there is no route by which the search endpoint can leak
-- a home address.
create or replace function search_spaces(
  p_lat           double precision,
  p_lng           double precision,
  p_radius_m      integer default 1500,
  p_starts_at     timestamptz default null,
  p_ends_at       timestamptz default null,
  p_vehicle_type  vehicle_type default null,
  p_max_price_paise bigint default null,
  p_space_types   space_type[] default null,
  p_amenities     text[] default null,
  p_min_rating    numeric default null,
  p_instant_only  boolean default false,
  p_ev_only       boolean default false,
  p_sort          text default 'relevance',
  p_limit         integer default 60,
  p_offset        integer default 0
)
returns table (
  id                uuid,
  title             text,
  slug              text,
  locality          text,
  city              text,
  approx_lat        double precision,
  approx_lng        double precision,
  distance_m        integer,
  space_type        space_type,
  vehicle_types     vehicle_type[],
  amenities         text[],
  capacity          smallint,
  free_bays         integer,
  price_hourly_paise bigint,
  price_daily_paise  bigint,
  price_monthly_paise bigint,
  quoted_base_paise bigint,
  avg_rating        numeric,
  review_count      integer,
  instant_book      boolean,
  has_ev_charging   boolean,
  max_height_mm     integer,
  cancellation_policy cancellation_policy,
  is_superhost      boolean,
  primary_photo     text,
  relevance_score   double precision,
  total_count       bigint
)
language sql
stable
as $$
  with bounds as (
    select
      p_lat - (p_radius_m * lat_degrees_per_m())          as min_lat,
      p_lat + (p_radius_m * lat_degrees_per_m())          as max_lat,
      p_lng - (p_radius_m * lng_degrees_per_m(p_lat))     as min_lng,
      p_lng + (p_radius_m * lng_degrees_per_m(p_lat))     as max_lng
  ),
  candidates as (
    select
      ps.*,
      earth_distance_m(p_lat, p_lng, ps.lat, ps.lng) as dist_m
    from parking_spaces ps, bounds b
    where ps.status = 'active'
      -- Cheap rectangle first so the index does the work, exact circle second.
      and ps.lat between b.min_lat and b.max_lat
      and ps.lng between b.min_lng and b.max_lng
      and earth_distance_m(p_lat, p_lng, ps.lat, ps.lng) <= p_radius_m
      and (p_vehicle_type is null or p_vehicle_type = any(ps.vehicle_types))
      and (p_space_types is null or ps.space_type = any(p_space_types))
      and (p_amenities is null or ps.amenities @> p_amenities)
      and (p_min_rating is null or coalesce(ps.avg_rating, 0) >= p_min_rating)
      and (not p_instant_only or ps.instant_book)
      and (not p_ev_only or ps.has_ev_charging)
  ),
  priced as (
    select
      c.*,
      case
        when p_starts_at is null or p_ends_at is null then null
        else price_quote_paise(c.id, p_starts_at, p_ends_at)
      end as quoted_paise,
      case
        when p_starts_at is null or p_ends_at is null then c.capacity::integer
        when not is_space_available(c.id, p_starts_at, p_ends_at) then 0
        else count_free_bays(c.id, p_starts_at, p_ends_at)
      end as bays_free
    from candidates c
  ),
  filtered as (
    select * from priced
    where (p_starts_at is null or p_ends_at is null or bays_free > 0)
      and (p_max_price_paise is null
           or coalesce(quoted_paise, price_hourly_paise, price_daily_paise) <= p_max_price_paise)
  ),
  scored as (
    select
      f.*,
      -- Relevance blends proximity, rating, reliability and popularity. Proximity
      -- dominates, because in parking a space you cannot walk from is worthless
      -- however good it is.
      (
          0.50 * (1.0 - least(f.dist_m / nullif(p_radius_m, 0), 1.0))
        + 0.20 * (coalesce(f.avg_rating, 3.5) / 5.0)
        + 0.15 * least(f.review_count / 25.0, 1.0)
        + 0.10 * least(f.popularity_score / 100.0, 1.0)
        + 0.05 * (case when f.instant_book then 1.0 else 0.0 end)
      ) as score
    from filtered f
  )
  select
    s.id,
    s.title,
    s.slug,
    s.locality,
    s.city,
    s.approx_lat,
    s.approx_lng,
    round(s.dist_m)::integer,
    s.space_type,
    s.vehicle_types,
    s.amenities,
    s.capacity,
    s.bays_free,
    s.price_hourly_paise,
    s.price_daily_paise,
    s.price_monthly_paise,
    s.quoted_paise,
    s.avg_rating,
    s.review_count,
    s.instant_book,
    s.has_ev_charging,
    s.max_height_mm,
    s.cancellation_policy,
    coalesce(hp.is_superhost, false),
    (select sp.storage_path from space_photos sp
      where sp.space_id = s.id order by sp.sort_order limit 1),
    s.score,
    count(*) over () as total_count
  from scored s
  left join host_profiles hp on hp.user_id = s.host_id
  order by
    case when p_sort = 'distance' then s.dist_m end asc nulls last,
    case when p_sort = 'price_asc' then coalesce(s.quoted_paise, s.price_hourly_paise) end asc nulls last,
    case when p_sort = 'price_desc' then coalesce(s.quoted_paise, s.price_hourly_paise) end desc nulls last,
    case when p_sort = 'rating' then s.avg_rating end desc nulls last,
    case when p_sort = 'relevance' then s.score end desc nulls last,
    s.dist_m asc
  limit greatest(least(p_limit, 200), 1)
  offset greatest(p_offset, 0);
$$;

comment on function search_spaces is
  'Privacy-safe search. Selects approx_lat/approx_lng only. The true coordinate and address_line are never returned by this function.';

-- -----------------------------------------------------------------------------
-- space_availability_calendar — what the host calendar and the date picker draw
-- -----------------------------------------------------------------------------
create or replace function space_availability_calendar(
  p_space_id uuid,
  p_from     date,
  p_to       date
)
returns table (
  day             date,
  total_bays      smallint,
  booked_bays     integer,
  is_blocked      boolean,
  has_rules       boolean,
  multiplier_bp   integer
)
language sql
stable
as $$
  select
    d::date as day,
    ps.capacity as total_bays,
    (
      select count(distinct b.bay_index)::integer
        from bookings b
       where b.space_id = p_space_id
         and b.status in ('pending','confirmed','active')
         and b.period && tstzrange(
               (d::date)::timestamptz,
               (d::date + 1)::timestamptz, '[)')
    ) as booked_bays,
    exists (
      select 1 from availability_blocks ab
       where ab.space_id = p_space_id
         and ab.period && tstzrange((d::date)::timestamptz, (d::date + 1)::timestamptz, '[)')
    ) as is_blocked,
    exists (
      select 1 from availability_rules ar
       where ar.space_id = p_space_id
         and ar.day_of_week = extract(dow from d)::smallint
    ) as has_rules,
    coalesce((
      select max(po.multiplier_bp) from price_overrides po
       where po.space_id = p_space_id
         and po.period && tstzrange((d::date)::timestamptz, (d::date + 1)::timestamptz, '[)')
    ), 10000) as multiplier_bp
  from generate_series(p_from, p_to, interval '1 day') d
  cross join parking_spaces ps
  where ps.id = p_space_id;
$$;
