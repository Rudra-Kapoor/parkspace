#!/usr/bin/env node
/**
 * The concurrency test.
 *
 * This is the test that proves the central claim of the whole design: that two
 * drivers cannot both be sold the same bay for overlapping time.
 *
 * Every other test in this repository runs against pure functions. This one runs
 * against a real Postgres, because the guarantee it checks lives in the storage
 * engine and cannot be exercised any other way.
 *
 * It fires N genuinely concurrent transactions, each on its own connection, all
 * attempting to reserve the same bay over the same interval, and asserts that
 * exactly one commits.
 *
 *   npm run test:concurrency
 *
 * Requires .env.local with a working NEXT_PUBLIC_SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY. Cleans up everything it creates.
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';

const ROOT = process.cwd();
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 24);

async function loadDotEnv() {
  for (const name of ['.env.local', '.env']) {
    const file = path.join(ROOT, name);
    if (!existsSync(file)) continue;
    const contents = await readFile(file, 'utf8');
    for (const line of contents.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  }
}

const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;

let passed = 0;
let failed = 0;

function check(label, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  ${green('pass')}  ${label}${detail ? dim('  ' + detail) : ''}`);
  } else {
    failed += 1;
    console.log(`  ${red('FAIL')}  ${label}${detail ? '  ' + detail : ''}`);
  }
}

async function main() {
  await loadDotEnv();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !serviceKey) {
    console.error('\nMissing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local\n');
    process.exit(1);
  }

  const db = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log(bold('\nConcurrency test: the exclusion constraint\n'));

  // ---------------------------------------------------------------------------
  // Fixtures
  // ---------------------------------------------------------------------------
  const { data: space } = await db
    .from('parking_spaces')
    .select('id, title, capacity, host_id, price_hourly_paise')
    .eq('status', 'active')
    .eq('capacity', 1)
    .limit(1)
    .maybeSingle();

  if (!space) {
    console.error('No single-bay active listing found. Run npm run db:seed first.\n');
    process.exit(1);
  }

  const { data: drivers } = await db
    .from('profiles')
    .select('id, full_name')
    .neq('id', space.host_id)
    .limit(1);

  const driver = drivers?.[0];
  if (!driver) {
    console.error('No driver profile found. Run npm run db:seed first.\n');
    process.exit(1);
  }

  console.log(dim(`  space:  ${space.title}`));
  console.log(dim(`  bays:   ${space.capacity}`));
  console.log(dim(`  firing: ${CONCURRENCY} concurrent transactions\n`));

  // A window far enough out that no seeded booking touches it.
  const base = new Date();
  base.setUTCFullYear(base.getUTCFullYear() + 1);
  base.setUTCHours(10, 0, 0, 0);
  const startsAt = base.toISOString();
  const endsAt = new Date(base.getTime() + 3 * 60 * 60 * 1000).toISOString();

  const marker = `CONCURRENCY-TEST-${startsAt}`;

  async function cleanup() {
    await db.from('bookings').delete().eq('driver_notes', marker);
  }

  await cleanup();

  // ---------------------------------------------------------------------------
  // Test 1: N concurrent inserts, identical interval, same bay.
  //
  // Each supabase-js call is a separate HTTP request on its own connection, so
  // these are genuinely concurrent transactions rather than a sequential loop.
  // ---------------------------------------------------------------------------
  console.log(bold('  Test 1  identical interval, same bay'));

  const row = () => ({
    space_id: space.id,
    driver_id: driver.id,
    host_id: space.host_id,
    bay_index: 0,
    starts_at: startsAt,
    ends_at: endsAt,
    status: 'confirmed',
    base_amount_paise: 30000,
    total_amount_paise: 31770,
    service_fee_paise: 1500,
    tax_amount_paise: 270,
    host_commission_paise: 3000,
    host_payout_paise: 27000,
    driver_notes: marker,
  });

  const results = await Promise.allSettled(
    Array.from({ length: CONCURRENCY }, () => db.from('bookings').insert(row()).select('id')),
  );

  let committed = 0;
  let excluded = 0;
  let otherError = null;

  for (const r of results) {
    if (r.status === 'rejected') {
      otherError = otherError ?? String(r.reason);
      continue;
    }
    if (r.value.error) {
      // 23P01 is exclusion_violation. This is the expected loss.
      if (r.value.error.code === '23P01') excluded += 1;
      else otherError = otherError ?? `${r.value.error.code}: ${r.value.error.message}`;
    } else {
      committed += 1;
    }
  }

  check(
    'exactly one transaction committed',
    committed === 1,
    `committed=${committed} rejected_by_constraint=${excluded} of ${CONCURRENCY}`,
  );
  check(
    'every loser was rejected by the exclusion constraint, not by something else',
    excluded === CONCURRENCY - 1 && otherError === null,
    otherError ? `unexpected: ${otherError}` : '',
  );

  // ---------------------------------------------------------------------------
  // Test 2: overlapping but not identical intervals.
  //
  // Staggered starts that all overlap the winner. A naive equality check would
  // let these through; range overlap must not.
  // ---------------------------------------------------------------------------
  console.log(bold('\n  Test 2  staggered overlapping intervals'));

  await cleanup();

  const staggered = await Promise.allSettled(
    Array.from({ length: CONCURRENCY }, (_, i) => {
      const s = new Date(base.getTime() + i * 5 * 60 * 1000);
      const e = new Date(s.getTime() + 3 * 60 * 60 * 1000);
      return db
        .from('bookings')
        .insert({ ...row(), starts_at: s.toISOString(), ends_at: e.toISOString() })
        .select('id');
    }),
  );

  const staggeredOk = staggered.filter((r) => r.status === 'fulfilled' && !r.value.error).length;

  check(
    'overlapping ranges collapse to a single winner',
    staggeredOk === 1,
    `committed=${staggeredOk} of ${CONCURRENCY}`,
  );

  // ---------------------------------------------------------------------------
  // Test 3: touching but NOT overlapping must both succeed.
  //
  // The range is half-open, '[)', so a booking ending at 14:00 and one starting
  // at 14:00 do not collide. That is the correct semantics for parking: the
  // outgoing car leaves as the incoming one arrives. If this test fails, the
  // constraint is too aggressive and we are refusing legitimate money.
  // ---------------------------------------------------------------------------
  console.log(bold('\n  Test 3  back-to-back bookings must both succeed'));

  await cleanup();

  const t0 = new Date(base.getTime() + 48 * 60 * 60 * 1000);
  const t1 = new Date(t0.getTime() + 2 * 60 * 60 * 1000);
  const t2 = new Date(t1.getTime() + 2 * 60 * 60 * 1000);

  const backToBack = await Promise.allSettled([
    db.from('bookings').insert({ ...row(), starts_at: t0.toISOString(), ends_at: t1.toISOString() }).select('id'),
    db.from('bookings').insert({ ...row(), starts_at: t1.toISOString(), ends_at: t2.toISOString() }).select('id'),
  ]);

  const bothCommitted = backToBack.filter((r) => r.status === 'fulfilled' && !r.value.error).length;

  check(
    'a booking ending at T and one starting at T both commit',
    bothCommitted === 2,
    `committed=${bothCommitted} of 2`,
  );

  // ---------------------------------------------------------------------------
  // Test 4: a multi-bay space accepts exactly capacity bookings.
  // ---------------------------------------------------------------------------
  console.log(bold('\n  Test 4  a multi-bay space fills to capacity and no further'));

  await cleanup();

  const { data: multi } = await db
    .from('parking_spaces')
    .select('id, title, capacity, host_id')
    .eq('status', 'active')
    .gt('capacity', 1)
    .order('capacity', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (multi) {
    const attempts = multi.capacity + 6;
    const multiResults = await Promise.allSettled(
      Array.from({ length: attempts }, (_, i) =>
        db
          .from('bookings')
          .insert({
            ...row(),
            space_id: multi.id,
            host_id: multi.host_id,
            bay_index: i % multi.capacity,
          })
          .select('id'),
      ),
    );

    const multiOk = multiResults.filter((r) => r.status === 'fulfilled' && !r.value.error).length;

    check(
      `a ${multi.capacity} bay space accepts exactly ${multi.capacity}`,
      multiOk === multi.capacity,
      `committed=${multiOk} of ${attempts} attempts on "${multi.title.slice(0, 34)}"`,
    );

    await db.from('bookings').delete().eq('driver_notes', marker);
  } else {
    console.log(dim('  skipped: no multi-bay listing found'));
  }

  // ---------------------------------------------------------------------------
  // Test 5: a cancelled booking releases its interval immediately.
  // ---------------------------------------------------------------------------
  console.log(bold('\n  Test 5  a cancelled booking releases its bay'));

  await cleanup();

  const { data: first } = await db.from('bookings').insert(row()).select('id').single();

  const { error: blocked } = await db.from('bookings').insert(row()).select('id');
  check('the slot is blocked while the first booking is live', blocked?.code === '23P01');

  await db
    .from('bookings')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancelled_by: 'driver' })
    .eq('id', first.id);

  const { error: afterCancel } = await db.from('bookings').insert(row()).select('id');
  check('the slot is bookable again once cancelled', !afterCancel, afterCancel?.message ?? '');

  await cleanup();

  // ---------------------------------------------------------------------------
  // Test 6: the location privacy rule, from an anonymous client.
  // ---------------------------------------------------------------------------
  console.log(bold('\n  Test 6  location privacy, as an anonymous visitor'));

  if (anonKey) {
    const anon = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: publicRows } = await anon.from('public_spaces').select('*').limit(5);
    const leaked = (publicRows ?? []).filter(
      (r) => r.address_line !== null || r.exact_lat !== null || r.access_instructions !== null,
    );

    check(
      'the public view exposes no address, coordinate or access instructions',
      (publicRows?.length ?? 0) > 0 && leaked.length === 0,
      `${publicRows?.length ?? 0} listings read, ${leaked.length} leaked`,
    );

    const { data: approx } = await anon
      .from('public_spaces')
      .select('approx_lat, approx_lng')
      .limit(1)
      .maybeSingle();

    check('an approximate coordinate IS published, so the map still works', approx?.approx_lat != null);

    const { error: baseTable } = await anon.from('parking_spaces').select('address_line').limit(1);
    check(
      'selecting the address column off the base table is refused',
      Boolean(baseTable),
      baseTable ? `refused: ${baseTable.code ?? baseTable.message}` : 'IT WAS ALLOWED',
    );

    const { data: otherBookings } = await anon.from('bookings').select('id').limit(1);
    check(
      'an anonymous client can read no bookings at all',
      (otherBookings?.length ?? 0) === 0,
      `rows visible: ${otherBookings?.length ?? 0}`,
    );
  } else {
    console.log(dim('  skipped: no anon key configured'));
  }

  // ---------------------------------------------------------------------------
  console.log(
    failed === 0
      ? green(`\n${passed} checks passed.\n`)
      : red(`\n${passed} passed, ${failed} FAILED.\n`),
  );

  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(red(`\nTest run failed: ${error.message}\n`));
  process.exit(1);
});
