#!/usr/bin/env node
/**
 * End-to-end booking flow, run as a real authenticated driver.
 *
 * Every other test in this repository either runs pure functions or connects
 * with the service role, which is exempt from Row Level Security. This one signs
 * in as a seeded driver and exercises the whole loop through the same privilege
 * level a real user has, which is the only way to catch the class of bug where
 * a policy quietly denies something the product depends on.
 *
 *   npm run test:flow
 *
 * It cleans up after itself.
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';

const ROOT = process.cwd();
const DEMO_PASSWORD = 'parkspace-demo-2026';
const DRIVER_EMAIL = 'arindam.driver@parkspace.demo';

async function loadDotEnv() {
  for (const name of ['.env.local', '.env']) {
    const file = path.join(ROOT, name);
    if (!existsSync(file)) continue;
    const contents = await readFile(file, 'utf8');
    for (const line of contents.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq === -1) continue;
      const k = t.slice(0, eq).trim();
      let v = t.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!(k in process.env)) process.env[k] = v;
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

function rupees(paise) {
  return `Rs ${(paise / 100).toFixed(2)}`;
}

async function main() {
  await loadDotEnv();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey || !serviceKey) {
    console.error('\nMissing Supabase configuration in .env.local\n');
    process.exit(1);
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const driver = createClient(url, anonKey, { auth: { persistSession: false } });

  console.log(bold('\nBooking flow, as a real authenticated driver\n'));

  // ---------------------------------------------------------------------------
  console.log(bold('  Sign in'));

  const { data: session, error: signInError } = await driver.auth.signInWithPassword({
    email: DRIVER_EMAIL,
    password: DEMO_PASSWORD,
  });

  check('a seeded driver can sign in with a password', !signInError && Boolean(session?.user), signInError?.message ?? '');
  if (signInError) {
    console.log(red('\n  Cannot continue without a session.\n'));
    process.exit(1);
  }

  const driverId = session.user.id;
  console.log(dim(`  signed in as ${DRIVER_EMAIL}`));

  // ---------------------------------------------------------------------------
  console.log(bold('\n  Search'));

  const { data: found, error: searchError } = await driver.rpc('search_spaces', {
    p_lat: 22.5726, p_lng: 88.3639, p_radius_m: 20000,
    p_starts_at: null, p_ends_at: null, p_vehicle_type: null,
    p_max_price_paise: null, p_space_types: null, p_amenities: null,
    p_min_rating: null, p_instant_only: false, p_ev_only: false,
    p_sort: 'distance', p_limit: 20, p_offset: 0,
  });

  check('search returns listings', !searchError && (found?.length ?? 0) > 0, searchError?.message ?? `${found?.length ?? 0} found`);

  const target = (found ?? []).find((s) => s.price_hourly_paise != null && s.capacity === 1)
    ?? (found ?? [])[0];

  if (!target) {
    console.log(red('\n  No bookable listing found.\n'));
    process.exit(1);
  }

  console.log(dim(`  target: ${target.title}`));

  // ---------------------------------------------------------------------------
  console.log(bold('\n  Before booking, the address must be hidden'));

  const { data: beforeSpace } = await driver
    .from('public_spaces')
    .select('address_line, exact_lat, access_instructions, approx_lat')
    .eq('id', target.id)
    .maybeSingle();

  check('address_line is null', beforeSpace?.address_line === null);
  check('the exact coordinate is null', beforeSpace?.exact_lat === null);
  check('access instructions are null', beforeSpace?.access_instructions === null);
  check('but the approximate coordinate IS present', beforeSpace?.approx_lat != null);

  // ---------------------------------------------------------------------------
  console.log(bold('\n  Quote'));

  // Find a window this host actually accepts.
  //
  // Hosts publish opening hours, and the seeded driveway is let weekdays 09:00
  // to 18:00 only. A test that picked a fixed offset would fail on a Saturday
  // and look like a product bug when it is the availability engine working
  // exactly as intended. So probe for a window the host is open for, starting
  // inside 24 hours so the address-release rule is also exercised.
  let start = null;
  let end = null;

  for (let hoursOut = 20; hoursOut <= 24 * 9 && start === null; hoursOut += 1) {
    const candidateStart = new Date(Date.now() + hoursOut * 60 * 60 * 1000);
    candidateStart.setMinutes(0, 0, 0);
    const candidateEnd = new Date(candidateStart.getTime() + 3 * 60 * 60 * 1000);

    const { data: free } = await driver.rpc('is_space_available', {
      p_space_id: target.id,
      p_starts_at: candidateStart.toISOString(),
      p_ends_at: candidateEnd.toISOString(),
    });

    if (free === true) {
      start = candidateStart;
      end = candidateEnd;
    }
  }

  check('a bookable window exists within the next nine days', start !== null);

  if (start === null) {
    console.log(red('\n  This host has no open window in the search horizon.\n'));
    process.exit(1);
  }

  const hoursAhead = (start.getTime() - Date.now()) / 3_600_000;
  console.log(
    dim(
      `  window: ${start.toLocaleString('en-IN')} for 3h ` +
        `(${hoursAhead.toFixed(1)}h from now)`,
    ),
  );

  const { data: quote, error: quoteError } = await driver.rpc('quote_booking', {
    p_space_id: target.id,
    p_starts_at: start.toISOString(),
    p_ends_at: end.toISOString(),
    p_coupon_code: null,
    p_use_wallet: false,
    p_user_id: null,
  });

  check('a driver can get a quote', !quoteError && quote?.ok === true, quoteError?.message ?? quote?.error ?? '');

  if (quote?.ok) {
    console.log(
      dim(
        `  base ${rupees(quote.base_amount_paise)} + fee ${rupees(quote.service_fee_paise)} ` +
          `+ tax ${rupees(quote.tax_amount_paise)} = ${rupees(quote.total_amount_paise)}`,
      ),
    );
    console.log(dim(`  host receives ${rupees(quote.host_payout_paise)}`));

    check(
      'the total is internally consistent',
      quote.total_amount_paise ===
        quote.base_amount_paise - quote.discount_amount_paise - quote.wallet_applied_paise +
          quote.service_fee_paise + quote.tax_amount_paise,
    );
    check(
      'commission plus payout equals the parking charge',
      quote.host_commission_paise + quote.host_payout_paise ===
        quote.base_amount_paise - quote.discount_amount_paise,
    );
    check('the space reports itself available', quote.available === true);
  }

  // ---------------------------------------------------------------------------
  console.log(bold('\n  Hold'));

  const { data: vehicles } = await driver.from('vehicles').select('id').eq('owner_id', driverId).limit(1);

  const { data: hold, error: holdError } = await driver.rpc('create_booking_hold', {
    p_space_id: target.id,
    p_starts_at: start.toISOString(),
    p_ends_at: end.toISOString(),
    p_vehicle_id: vehicles?.[0]?.id ?? null,
    p_coupon_code: null,
    p_use_wallet: false,
    p_notes: 'FLOW-TEST',
  });

  check('the driver can place a hold', !holdError && hold?.ok === true, holdError?.message ?? hold?.error ?? '');

  if (!hold?.ok) {
    console.log(red('\n  Cannot continue without a hold.\n'));
    await admin.from('bookings').delete().eq('driver_notes', 'FLOW-TEST');
    process.exit(1);
  }

  const bookingId = hold.booking_id;
  console.log(dim(`  booking ${hold.code}, bay ${hold.bay_index}, hold expires ${new Date(hold.hold_expires_at).toLocaleTimeString()}`));

  check('the hold has an expiry', Boolean(hold.hold_expires_at));

  // A second attempt on the same slot must lose.
  const { data: second } = await driver.rpc('create_booking_hold', {
    p_space_id: target.id,
    p_starts_at: start.toISOString(),
    p_ends_at: end.toISOString(),
    p_vehicle_id: null, p_coupon_code: null, p_use_wallet: false, p_notes: 'FLOW-TEST',
  });

  check(
    'a second hold on the same slot is refused',
    second?.ok === false && second?.error === 'SPACE_NO_LONGER_AVAILABLE',
    `got ${second?.error ?? 'success'}`,
  );

  // ---------------------------------------------------------------------------
  console.log(bold('\n  Address stays hidden while the booking is only held'));

  const { data: heldSpace } = await driver
    .from('public_spaces')
    .select('address_line, access_instructions')
    .eq('id', target.id)
    .maybeSingle();

  check(
    'a pending hold does NOT release the address',
    heldSpace?.address_line === null && heldSpace?.access_instructions === null,
  );

  // ---------------------------------------------------------------------------
  console.log(bold('\n  Confirm, the way the webhook does'));

  const { data: payment } = await admin
    .from('payments')
    .insert({
      booking_id: bookingId,
      payer_id: driverId,
      provider: 'mock',
      provider_order_id: `flowtest_${bookingId.slice(0, 8)}`,
      amount_paise: quote.total_amount_paise,
      status: 'captured',
    })
    .select('id')
    .single();

  const { data: confirmed, error: confirmError } = await admin.rpc('confirm_booking', {
    p_booking_id: bookingId,
    p_payment_id: payment.id,
  });

  check('confirm_booking succeeds', !confirmError && confirmed?.ok === true, confirmError?.message ?? confirmed?.error ?? '');

  // Idempotency: a duplicate webhook must be a no-op.
  const { data: again } = await admin.rpc('confirm_booking', {
    p_booking_id: bookingId,
    p_payment_id: payment.id,
  });

  check('a duplicate confirmation is a no-op, not an error', again?.ok === true && again?.already === true);

  // ---------------------------------------------------------------------------
  console.log(bold('\n  Now the address must be released'));

  const { data: afterSpace } = await driver
    .from('public_spaces')
    .select('address_line, exact_lat, exact_lng, access_instructions, access_pin')
    .eq('id', target.id)
    .maybeSingle();

  const withinReleaseWindow = hoursAhead <= 24;

  if (withinReleaseWindow) {
    check('address_line is now visible to this driver', afterSpace?.address_line != null, afterSpace?.address_line ?? 'still null');
    check('the exact coordinate is now visible', afterSpace?.exact_lat != null);
    check(
      'access instructions are now visible',
      afterSpace?.access_instructions != null || afterSpace?.access_pin != null,
    );
  } else {
    // The only open window was more than 24 hours out, so the rule says the
    // address is still withheld. Assert that instead, which tests the same rule
    // from the other side.
    check(
      'the address is still withheld, because the stay is more than 24h away',
      afterSpace?.address_line === null,
      `${hoursAhead.toFixed(1)}h ahead, release opens at 24h`,
    );
  }

  // And it must STILL be hidden from everybody else.
  const stranger = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data: strangerView } = await stranger
    .from('public_spaces')
    .select('address_line, exact_lat')
    .eq('id', target.id)
    .maybeSingle();

  check(
    'and still hidden from a visitor with no booking',
    strangerView?.address_line === null && strangerView?.exact_lat === null,
  );

  // ---------------------------------------------------------------------------
  console.log(bold('\n  Cancel, and check the refund arithmetic'));

  const { data: preview } = await driver.rpc('compute_refund_paise', {
    p_booking_id: bookingId,
    p_by: 'driver',
  });

  check('a refund preview is available before committing', preview?.ok === true);

  if (preview?.ok) {
    console.log(
      dim(
        `  policy ${preview.policy}, ${Number(preview.hours_before_start).toFixed(1)}h before start ` +
          `-> refund ${rupees(preview.refund_paise)}, host keeps ${rupees(preview.host_keeps_paise)}`,
      ),
    );

    check(
      'the forfeit is fully accounted for between host and platform',
      preview.host_keeps_paise + (preview.platform_keeps_paise - preview.service_fee_retained_paise) ===
        preview.forfeited_paise,
    );
    check('nothing in the split is negative', [
      preview.refund_paise, preview.forfeited_paise,
      preview.host_keeps_paise, preview.platform_keeps_paise,
    ].every((v) => v >= 0));
  }

  const { data: cancelled, error: cancelError } = await driver.rpc('cancel_booking', {
    p_booking_id: bookingId,
    p_reason: 'flow test',
  });

  check('the driver can cancel their own booking', !cancelError && cancelled?.ok === true, cancelError?.message ?? cancelled?.error ?? '');
  check(
    'the committed refund matches the preview',
    cancelled?.refund_paise === preview?.refund_paise,
    `preview=${preview?.refund_paise} actual=${cancelled?.refund_paise}`,
  );

  // ---------------------------------------------------------------------------
  console.log(bold('\n  Authorization boundaries'));

  const { data: otherBookings } = await driver.from('bookings').select('id, driver_id').limit(100);
  const notMine = (otherBookings ?? []).filter((b) => b.driver_id !== driverId);
  check(
    'a driver sees only their own bookings',
    notMine.length === 0,
    `${otherBookings?.length ?? 0} visible, ${notMine.length} belonging to others`,
  );

  const { error: roleEscalation } = await driver
    .from('profiles')
    .update({ role: 'admin' })
    .eq('id', driverId);

  const { data: afterEscalation } = await driver.from('profiles').select('role').eq('id', driverId).maybeSingle();
  check(
    'a driver cannot make themselves an admin',
    afterEscalation?.role !== 'admin',
    roleEscalation ? 'rejected outright' : `role is still ${afterEscalation?.role}`,
  );

  const { error: walletTopUp } = await driver
    .from('profiles')
    .update({ wallet_balance_paise: 999_999_99 })
    .eq('id', driverId);

  const { data: afterTopUp } = await driver.from('profiles').select('wallet_balance_paise').eq('id', driverId).maybeSingle();
  check(
    'a driver cannot credit their own wallet',
    (afterTopUp?.wallet_balance_paise ?? 0) < 999_999_99,
    walletTopUp ? 'rejected outright' : `balance is ${rupees(afterTopUp?.wallet_balance_paise ?? 0)}`,
  );

  const { error: directInsert } = await driver.from('bookings').insert({
    space_id: target.id,
    driver_id: driverId,
    host_id: target.id,
    starts_at: start.toISOString(),
    ends_at: end.toISOString(),
    base_amount_paise: 1,
    total_amount_paise: 1,
  });

  check('a driver cannot insert a booking directly, bypassing the engine', Boolean(directInsert));

  // ---------------------------------------------------------------------------
  await admin.from('bookings').delete().eq('driver_notes', 'FLOW-TEST');
  await driver.auth.signOut();

  console.log(
    failed === 0
      ? green(`\n${passed} checks passed.\n`)
      : red(`\n${passed} passed, ${failed} FAILED.\n`),
  );

  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(red(`\nFlow test failed: ${error.message}\n`));
  process.exit(1);
});
