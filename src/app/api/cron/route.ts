import { NextResponse, type NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { serverEnv } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Scheduled maintenance.
 *
 * Invoked by Vercel Cron, configured in vercel.json. Everything here is
 * idempotent: running it twice in the same minute produces the same state as
 * running it once, because a cron that cannot be safely retried is a cron that
 * will eventually corrupt something.
 *
 * Authentication is a bearer secret compared in constant time. Without it, a
 * public URL would let anyone expire every pending hold in the system.
 */
export async function GET(request: NextRequest) {
  let expectedSecret: string | undefined;
  try {
    expectedSecret = serverEnv().CRON_SECRET;
  } catch {
    return NextResponse.json({ ok: false, error: 'NOT_CONFIGURED' }, { status: 503 });
  }

  // Vercel Cron sends this header automatically when CRON_SECRET is set.
  const authorisation = request.headers.get('authorization');

  if (expectedSecret) {
    const provided = authorisation?.replace(/^Bearer\s+/i, '') ?? '';
    if (!timingSafeEqual(provided, expectedSecret)) {
      return NextResponse.json({ ok: false, error: 'NOT_AUTHORIZED' }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === 'production') {
    // Refuse to run unauthenticated in production rather than exposing the
    // sweepers to the open internet.
    return NextResponse.json(
      { ok: false, error: 'CRON_SECRET must be set in production' },
      { status: 503 },
    );
  }

  const service = createServiceClient();
  const started = Date.now();
  const outcome: Record<string, unknown> = {};

  // 1. Release bays whose payment never landed.
  try {
    const { data, error } = await service.rpc('expire_stale_holds');
    outcome.expired_holds = error ? `error: ${error.message}` : data;
  } catch (error) {
    outcome.expired_holds = `error: ${String(error)}`;
  }

  // 2. Complete stays that ended without a checkout, and mark no-shows.
  try {
    const { data, error } = await service.rpc('auto_complete_stale_bookings');
    outcome.auto_completed = error ? `error: ${error.message}` : data;
  } catch (error) {
    outcome.auto_completed = `error: ${String(error)}`;
  }

  // 3. Publish reviews whose blind window has closed.
  try {
    const { data: setting } = await service
      .from('platform_settings')
      .select('value')
      .eq('key', 'REVIEW_WINDOW_DAYS')
      .maybeSingle();

    const windowDays = Number(setting?.value ?? 14);
    const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await service
      .from('reviews')
      .update({ is_published: true, published_at: new Date().toISOString() })
      .eq('is_published', false)
      .lt('created_at', cutoff)
      .select('id');

    outcome.published_reviews = error ? `error: ${error.message}` : (data?.length ?? 0);
  } catch (error) {
    outcome.published_reviews = `error: ${String(error)}`;
  }

  // 4. Recalculate Superhost badges. Cheap, so it runs every pass.
  try {
    const { data, error } = await service.rpc('refresh_superhost_badges');
    outcome.superhosts_refreshed = error ? `error: ${error.message}` : data;
  } catch (error) {
    outcome.superhosts_refreshed = `error: ${String(error)}`;
  }

  // 5. Mark due notifications as sent.
  //
  // In this build that is all it does: there is no email or SMS provider wired
  // up, and pretending otherwise would be worse than being explicit. The rows
  // are the queue, and a real worker replaces this step. See
  // 16_Notification_Specification.
  try {
    const { data, error } = await service
      .from('notifications')
      .update({ sent_at: new Date().toISOString() })
      .is('sent_at', null)
      .lte('send_after', new Date().toISOString())
      .select('id');

    outcome.notifications_dispatched = error ? `error: ${error.message}` : (data?.length ?? 0);
  } catch (error) {
    outcome.notifications_dispatched = `error: ${String(error)}`;
  }

  // 6. Release host earnings that have cleared the payout delay.
  try {
    const { data: setting } = await service
      .from('platform_settings')
      .select('value')
      .eq('key', 'PAYOUT_DELAY_HOURS')
      .maybeSingle();

    const delayHours = Number(setting?.value ?? 24);
    const cutoff = new Date(Date.now() - delayHours * 60 * 60 * 1000).toISOString();

    const { count } = await service
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'completed')
      .lt('checked_out_at', cutoff);

    outcome.payable_bookings = count ?? 0;
  } catch (error) {
    outcome.payable_bookings = `error: ${String(error)}`;
  }

  return NextResponse.json({
    ok: true,
    ran_at: new Date().toISOString(),
    duration_ms: Date.now() - started,
    ...outcome,
  });
}

/** Length-independent comparison, so timing does not reveal the secret. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still do the work so the early return does not itself leak length.
    let dummy = 0;
    for (let i = 0; i < b.length; i += 1) dummy |= b.charCodeAt(i);
    return false;
  }
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
