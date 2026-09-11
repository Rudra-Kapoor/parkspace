-- =============================================================================
-- ParkSpace — development seed data
-- =============================================================================
-- Real Kolkata geography, invented hosts and listings. Safe to run repeatedly:
-- every insert is guarded, and the whole file is idempotent on the seed marker.
--
-- Scope: this file seeds only reference data that belongs to no user, namely the
-- neighbourhood table behind the local SEO routes and a few demo coupons. It
-- creates no users and no listings, because both need auth.users rows that only
-- Supabase Auth can issue.
--
-- Hosts, listings, drivers and vehicles come from scripts/db-seed.mjs, which
-- creates the auth users first and then inserts against them. Run:
--   npm run db:push   applies migrations, then this file
--   npm run db:seed   creates the demo accounts and listings
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Neighbourhood reference data, used by the local SEO routes
-- -----------------------------------------------------------------------------
create table if not exists seo_localities (
  slug          text primary key,
  city_slug     text not null,
  city          text not null,
  locality      text not null,
  state         text not null,
  lat           double precision not null,
  lng           double precision not null,
  blurb         text,
  landmarks     text[] not null default '{}',
  sort_order    integer not null default 0,
  is_published  boolean not null default true
);

alter table seo_localities enable row level security;

drop policy if exists seo_localities_public_read on seo_localities;
create policy seo_localities_public_read on seo_localities
  for select using (is_published);

insert into seo_localities (slug, city_slug, city, locality, state, lat, lng, blurb, landmarks, sort_order) values
  ('park-street', 'kolkata', 'Kolkata', 'Park Street', 'West Bengal', 22.5524, 88.3520,
   'Kolkata''s restaurant and nightlife spine. Kerb space is effectively full from midday until late, and the side lanes off Middleton Row fill first.',
   array['Park Street Metro','Asiatic Society','St Xavier''s College','Middleton Row'], 1),

  ('esplanade', 'kolkata', 'Kolkata', 'Esplanade', 'West Bengal', 22.5646, 88.3510,
   'The transport heart of the city. Esplanade combines a metro interchange, the bus terminus and the office district, so demand runs from early morning to late evening.',
   array['Esplanade Metro','New Market','Raj Bhavan','Tipu Sultan Mosque'], 2),

  ('camac-street', 'kolkata', 'Kolkata', 'Camac Street', 'West Bengal', 22.5448, 88.3527,
   'Corporate offices and shopping. Weekday demand is dominated by nine to six commuters, which is exactly the window when nearby residential driveways sit empty.',
   array['Camac Street','Quest Mall','Vardaan Market','AJC Bose Road'], 3),

  ('salt-lake-sector-v', 'kolkata', 'Kolkata', 'Salt Lake Sector V', 'West Bengal', 22.5760, 88.4310,
   'The IT district. Thousands of employees arrive between nine and ten and leave between six and eight, producing the most predictable parking demand curve in the city.',
   array['Sector V','College More','Technopolis','Webel More'], 4),

  ('ballygunge', 'kolkata', 'Kolkata', 'Ballygunge', 'West Bengal', 22.5262, 88.3653,
   'Dense residential south Kolkata with narrow lanes and a high concentration of private driveways, many of which are empty during working hours.',
   array['Ballygunge Phari','Gariahat','Quest Mall','Ballygunge Station'], 5),

  ('new-town', 'kolkata', 'Kolkata', 'New Town', 'West Bengal', 22.5800, 88.4700,
   'Planned development with wide roads and new commercial blocks. Parking is less constrained than central Kolkata, so demand concentrates around offices and the ecopark.',
   array['Eco Park','Biswa Bangla Gate','Axis Mall','Coal India Building'], 6),

  ('howrah-station', 'kolkata', 'Kolkata', 'Howrah', 'West Bengal', 22.5839, 88.3426,
   'One of the busiest railway terminals in the country. Demand here skews to multi-day parking from travellers rather than hourly parking from commuters.',
   array['Howrah Station','Howrah Bridge','Mullick Ghat'], 7),

  ('kolkata-airport', 'kolkata', 'Kolkata', 'Dum Dum Airport', 'West Bengal', 22.6547, 88.4467,
   'Netaji Subhas Chandra Bose International Airport. The dominant booking shape is three to seven days, and drivers care far more about security and a reliable return than about price.',
   array['NSCBI Airport Terminal 1','Jessore Road','Dum Dum Cantonment'], 8)
on conflict (slug) do update set
  blurb = excluded.blurb,
  landmarks = excluded.landmarks,
  lat = excluded.lat,
  lng = excluded.lng;

-- -----------------------------------------------------------------------------
-- Demo coupons
-- -----------------------------------------------------------------------------
insert into coupons (code, description, coupon_type, value, max_discount_paise,
                     min_booking_paise, max_per_user, new_users_only, first_booking_only,
                     valid_until, is_active)
values
  ('FIRSTPARK', 'Rs 50 off your first booking', 'flat', 5000, null, 20000, 1, true, true,
   now() + interval '180 days', true),
  ('PARK20', '20 percent off, up to Rs 100', 'percent', 2000, 10000, 15000, 3, false, false,
   now() + interval '90 days', true),
  ('MONSOON', 'Rs 30 off any booking', 'flat', 3000, null, 10000, 5, false, false,
   now() + interval '60 days', true)
on conflict (code) do nothing;

commit;
