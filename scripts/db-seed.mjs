#!/usr/bin/env node
/**
 * Seed the database with demo hosts, listings and bookings.
 *
 * Creates real Supabase Auth users so the whole flow can be exercised: sign in
 * as a host, see the dashboard; sign in as a driver, make a booking.
 *
 * Uses the service role key, which bypasses Row Level Security. That is correct
 * here and nowhere else in the product.
 *
 * Safe to run repeatedly. Existing demo users are reused rather than duplicated.
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';

const ROOT = process.cwd();

async function loadDotEnv() {
  for (const name of ['.env.local', '.env']) {
    const file = path.join(ROOT, name);
    if (!existsSync(file)) continue;
    const contents = await readFile(file, 'utf8');
    for (const line of contents.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const equals = trimmed.indexOf('=');
      if (equals === -1) continue;
      const key = trimmed.slice(0, equals).trim();
      let value = trimmed.slice(equals + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  }
}

const DEMO_PASSWORD = 'parkspace-demo-2026';

/** Real Kolkata coordinates, invented hosts and listings. */
const HOSTS = [
  {
    email: 'kalpana.host@parkspace.demo',
    name: 'Kalpana Sen',
    display: 'Kalpana S',
    business: false,
    spaces: [
      {
        title: 'Covered driveway off Middleton Row',
        description:
          'A covered driveway beside the house, one minute from Park Street. Room for one car comfortably. The gate is unlocked between 9 and 6 on weekdays and I am usually home if you need anything. Please do not block the neighbours side.',
        address_line: '14B Middleton Row',
        landmark: 'Opposite the corner bakery',
        locality: 'Park Street',
        lat: 22.5518,
        lng: 88.3531,
        space_type: 'driveway',
        vehicle_types: ['hatchback', 'sedan'],
        capacity: 1,
        max_length_mm: 4600,
        max_width_mm: 1900,
        max_height_mm: 2100,
        amenities: ['covered', 'cctv', 'lit', 'gated'],
        rules: ['No overnight parking', 'Please reverse in, the exit is tight', 'No commercial vehicles'],
        price_hourly_paise: 5000,
        price_daily_paise: 30000,
        cancellation_policy: 'moderate',
        access_method: 'host_greets',
        access_instructions:
          'Ring the bell marked Sen on the left gate post. If nobody answers, the side gate code is on your booking. Park nose out.',
        access_pin: '4417',
        instant_book: true,
        availability: [
          { day: 1, start: '09:00', end: '18:00' },
          { day: 2, start: '09:00', end: '18:00' },
          { day: 3, start: '09:00', end: '18:00' },
          { day: 4, start: '09:00', end: '18:00' },
          { day: 5, start: '09:00', end: '18:00' },
        ],
      },
    ],
  },
  {
    email: 'rajib.host@parkspace.demo',
    name: 'Rajib Dutta',
    display: 'Peerless Inn Annexe',
    business: true,
    businessName: 'Dutta Hospitality Services',
    spaces: [
      {
        title: 'Secure basement parking near Esplanade',
        description:
          'Eight bays in a manned basement two minutes from Esplanade metro. Attendant on duty from 7am to 11pm, CCTV throughout, and a lift to street level. Suits commuters and anyone visiting New Market. Height limit is strict, please check before booking.',
        address_line: 'Basement, Chowringhee Chambers, 8 Jawaharlal Nehru Road',
        landmark: 'Next to the Esplanade metro exit 3',
        locality: 'Esplanade',
        lat: 22.5652,
        lng: 88.3502,
        space_type: 'basement',
        vehicle_types: ['hatchback', 'sedan', 'suv', 'electric'],
        capacity: 8,
        max_length_mm: 5000,
        max_width_mm: 2000,
        max_height_mm: 1900,
        amenities: ['cctv', 'security_guard', 'covered', 'lit', 'lift', 'attendant', 'power_backup'],
        rules: ['Show your booking code to the attendant', 'Maximum height 1.9 m, strictly enforced', 'No vehicle repairs on site'],
        price_hourly_paise: 4000,
        price_daily_paise: 25000,
        price_monthly_paise: 450000,
        cancellation_policy: 'flexible',
        access_method: 'qr_code',
        access_instructions:
          'Enter from the service road behind the building. Show the QR at the barrier. The attendant will point you to a free bay.',
        instant_book: true,
        availability: [],
      },
    ],
  },
  {
    email: 'sneha.host@parkspace.demo',
    name: 'Sneha Roy',
    display: 'Sneha R',
    business: false,
    spaces: [
      {
        title: 'Second parking slot in gated complex, Ballygunge',
        description:
          'My second allotted slot in a gated residential complex off Ballygunge Circular Road. The security desk has a list of expected vehicles, so your registration needs to be on the booking. Quiet, shaded and very safe. Ten minutes walk to Gariahat.',
        address_line: 'Slot B-12, Ashiana Apartments, 22 Ballygunge Circular Road',
        landmark: 'Gate faces the park',
        locality: 'Ballygunge',
        lat: 22.5281,
        lng: 88.3642,
        space_type: 'open_lot',
        vehicle_types: ['hatchback', 'sedan', 'suv'],
        capacity: 1,
        max_length_mm: 4800,
        max_width_mm: 2000,
        amenities: ['gated', 'security_guard', 'lit', 'cctv'],
        rules: ['Registration must match your booking', 'Sound the horn once at the gate', 'No visitors after 10pm'],
        price_hourly_paise: 3500,
        price_daily_paise: 22000,
        price_monthly_paise: 380000,
        cancellation_policy: 'moderate',
        access_method: 'host_greets',
        access_instructions:
          'Tell the guard at the main gate you are parking in B-12 and give your booking code. Slot B-12 is on the left after the ramp.',
        instant_book: false,
        availability: [],
      },
    ],
  },
  {
    email: 'saltlake.host@parkspace.demo',
    name: 'Anirban Ghosh',
    display: 'Sector V Parking',
    business: true,
    businessName: 'Ghosh Properties LLP',
    spaces: [
      {
        title: 'Office car park, Salt Lake Sector V, weekday monthly',
        description:
          'Twenty bays in an office car park in Sector V, available on monthly terms for commuters. Ideal if you work in the IT corridor and are tired of hunting for a spot every morning. Open 7am to 9pm on weekdays, closed at weekends.',
        address_line: 'Ground level car park, Technopolis Building, Block BP',
        landmark: 'Near College More',
        locality: 'Salt Lake Sector V',
        lat: 22.5748,
        lng: 88.4298,
        space_type: 'open_lot',
        vehicle_types: ['two_wheeler', 'hatchback', 'sedan', 'suv', 'electric'],
        capacity: 20,
        max_height_mm: 2200,
        amenities: ['cctv', 'security_guard', 'lit', 'ev_charging', 'restroom'],
        rules: ['Weekdays only', 'Display your booking code on the dashboard', 'Site closes at 9pm sharp'],
        price_hourly_paise: 3000,
        price_daily_paise: 18000,
        price_monthly_paise: 300000,
        cancellation_policy: 'strict',
        access_method: 'qr_code',
        access_instructions: 'Scan the QR at the boom barrier on the Block BP side. Any unmarked bay is fine.',
        instant_book: true,
        has_ev_charging: true,
        ev_connector_type: 'Type 2',
        ev_power_kw: 7.2,
        ev_price_per_kwh_paise: 1500,
        availability: [
          { day: 1, start: '07:00', end: '21:00' },
          { day: 2, start: '07:00', end: '21:00' },
          { day: 3, start: '07:00', end: '21:00' },
          { day: 4, start: '07:00', end: '21:00' },
          { day: 5, start: '07:00', end: '21:00' },
        ],
      },
    ],
  },
  {
    email: 'airport.host@parkspace.demo',
    name: 'Farhan Ali',
    display: 'Jessore Road Parking',
    business: true,
    businessName: 'Ali Brothers Parking',
    spaces: [
      {
        title: 'Long stay airport parking with shuttle, Dum Dum',
        description:
          'Fenced, lit compound eight minutes from the airport terminal, built for travellers leaving a car for several days. Free shuttle on request between 5am and 11pm. We note your odometer reading on arrival and departure, and the compound is manned around the clock.',
        address_line: '47 Jessore Road, near the Dum Dum Cantonment crossing',
        landmark: 'Behind the petrol pump',
        locality: 'Dum Dum Airport',
        lat: 22.6483,
        lng: 88.4421,
        space_type: 'open_lot',
        vehicle_types: ['hatchback', 'sedan', 'suv', 'commercial'],
        capacity: 40,
        amenities: ['cctv', 'security_guard', 'gated', 'lit', 'wash', 'attendant', 'restroom'],
        rules: ['Leave a spare key with the office if you want the car moved', 'Shuttle must be booked an hour ahead', 'Minimum one day'],
        price_daily_paise: 20000,
        price_monthly_paise: 400000,
        cancellation_policy: 'moderate',
        access_method: 'host_greets',
        access_instructions:
          'Drive in through the main gate and stop at the office on the right. Give your booking code and they will park it for you.',
        instant_book: true,
        min_booking_minutes: 720,
        availability: [],
      },
    ],
  },
];

const DRIVERS = [
  { email: 'arindam.driver@parkspace.demo', name: 'Arindam Basu', reg: 'WB02AB1234', type: 'sedan', make: 'Honda', model: 'City', colour: 'Silver', height: 1495 },
  { email: 'debjani.driver@parkspace.demo', name: 'Debjani Mitra', reg: 'WB06CD5678', type: 'suv', make: 'Hyundai', model: 'Creta', colour: 'White', height: 1635 },
];

async function main() {
  await loadDotEnv();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    console.error(`
Missing configuration.

Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local,
then run npm run db:seed again.
`);
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log('Seeding demo data\n');

  async function ensureUser(email, name) {
    const { data: created, error } = await supabase.auth.admin.createUser({
      email,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: name },
    });

    if (!error && created?.user) return created.user.id;

    // Already exists. Find it.
    const { data: list } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
    const found = list?.users.find((u) => u.email === email);

    if (!found) throw new Error(`Could not create or find ${email}: ${error?.message}`);
    return found.id;
  }

  // -------------------------------------------------------------------------
  // Hosts and listings
  // -------------------------------------------------------------------------
  let spaceCount = 0;

  for (const host of HOSTS) {
    const userId = await ensureUser(host.email, host.name);
    console.log(`  host   ${host.email}`);

    await supabase
      .from('profiles')
      .update({ role: 'host', roles: ['driver', 'host'], verification: 'verified', full_name: host.name })
      .eq('id', userId);

    await supabase.from('host_profiles').upsert(
      {
        user_id: userId,
        display_name: host.display,
        is_business: host.business,
        business_name: host.businessName ?? null,
        kyc_status: 'verified',
      },
      { onConflict: 'user_id' },
    );

    for (const space of host.spaces) {
      const { data: existing } = await supabase
        .from('parking_spaces')
        .select('id')
        .eq('host_id', userId)
        .eq('title', space.title)
        .maybeSingle();

      if (existing) {
        console.log(`    space  ${space.title.slice(0, 48)} (already present)`);
        continue;
      }

      const { availability, ...spaceFields } = space;

      const { data: inserted, error: spaceError } = await supabase
        .from('parking_spaces')
        .insert({
          host_id: userId,
          city: 'Kolkata',
          state: 'West Bengal',
          country: 'IN',
          status: 'active',
          published_at: new Date().toISOString(),
          ...spaceFields,
        })
        .select('id')
        .single();

      if (spaceError) {
        console.error(`    FAILED ${space.title}: ${spaceError.message}`);
        continue;
      }

      spaceCount += 1;
      console.log(`    space  ${space.title.slice(0, 48)}`);

      if (availability?.length) {
        await supabase.from('availability_rules').insert(
          availability.map((rule) => ({
            space_id: inserted.id,
            day_of_week: rule.day,
            start_time: rule.start,
            end_time: rule.end,
            ends_next_day: false,
          })),
        );
      }
    }
  }

  // -------------------------------------------------------------------------
  // Drivers
  // -------------------------------------------------------------------------
  for (const driver of DRIVERS) {
    const userId = await ensureUser(driver.email, driver.name);
    console.log(`  driver ${driver.email}`);

    await supabase.from('profiles').update({ full_name: driver.name, verification: 'verified' }).eq('id', userId);

    const { data: existingVehicle } = await supabase
      .from('vehicles')
      .select('id')
      .eq('owner_id', userId)
      .eq('registration_number', driver.reg)
      .maybeSingle();

    if (!existingVehicle) {
      await supabase.from('vehicles').insert({
        owner_id: userId,
        registration_number: driver.reg,
        vehicle_type: driver.type,
        make: driver.make,
        model: driver.model,
        colour: driver.colour,
        height_mm: driver.height,
        length_mm: 4400,
        width_mm: 1780,
        is_default: true,
      });
    }
  }

  // -------------------------------------------------------------------------
  // An admin
  // -------------------------------------------------------------------------
  const adminId = await ensureUser('admin@parkspace.demo', 'Platform Admin');
  await supabase
    .from('profiles')
    .update({ role: 'admin', roles: ['driver', 'host', 'admin'], verification: 'verified' })
    .eq('id', adminId);
  console.log(`  admin  admin@parkspace.demo`);

  console.log(`
Seed complete. ${spaceCount} new listing${spaceCount === 1 ? '' : 's'} created.

Sign in with any of these. The password is the same for all of them:

  Password:  ${DEMO_PASSWORD}

  Driver     arindam.driver@parkspace.demo
  Driver     debjani.driver@parkspace.demo
  Host       kalpana.host@parkspace.demo
  Host       rajib.host@parkspace.demo
  Host       saltlake.host@parkspace.demo
  Admin      admin@parkspace.demo

Use the password option on the sign-in page, not the magic link, since these
addresses do not receive email.
`);
}

main().catch((error) => {
  console.error(`\nSeeding failed: ${error.message}\n`);
  process.exit(1);
});
