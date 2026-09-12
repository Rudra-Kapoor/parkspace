import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { bookingRequestSchema, fieldErrors } from '@/lib/validation';
import { callerKey, LIMITS, rateLimit, rateLimitHeaders } from '@/lib/rate-limit';
import { AppError, isAppErrorCode } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Create a booking hold.
 *
 * This is the moment the inventory is actually reserved. Everything before it is
 * browsing; everything after it is payment.
 *
 * Three things make this safe:
 *
 * 1. create_booking_hold() does all the validation and the insert in one
 *    transaction, so there is no window between "is it free" and "take it".
 *
 * 2. The exclusion constraint in the database means a lost race returns a clean
 *    SPACE_NO_LONGER_AVAILABLE rather than a second booking on the same bay.
 *
 * 3. The idempotency key means a double-clicked Pay button, or a retry after a
 *    dropped connection, returns the existing hold rather than creating a second
 *    one and charging twice.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(new AppError('NOT_AUTHENTICATED').toResponseBody(), { status: 401 });
  }

  const limit = rateLimit(callerKey(request, user.id), LIMITS.booking.limit, LIMITS.booking.windowMs);
  if (!limit.ok) {
    return NextResponse.json(new AppError('RATE_LIMITED').toResponseBody(), {
      status: 429,
      headers: rateLimitHeaders(limit),
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(new AppError('VALIDATION_FAILED').toResponseBody(), { status: 400 });
  }

  const parsed = bookingRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ...new AppError('VALIDATION_FAILED').toResponseBody(), fields: fieldErrors(parsed.error) },
      { status: 400 },
    );
  }

  const input = parsed.data;

  // ---------------------------------------------------------------------------
  // Idempotency.
  //
  // A hold already created under this key is returned as-is. The window is the
  // last hour, which comfortably covers a user retrying a failed payment while
  // not resurrecting a booking they made yesterday.
  // ---------------------------------------------------------------------------
  const { data: existing } = await supabase
    .from('bookings')
    .select('id, code, status, total_amount_paise, hold_expires_at, starts_at, ends_at')
    .eq('driver_id', user.id)
    .eq('space_id', input.space_id)
    .eq('starts_at', input.starts_at)
    .eq('ends_at', input.ends_at)
    .in('status', ['pending', 'confirmed'])
    .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      {
        ok: true,
        idempotent: true,
        booking_id: existing.id,
        code: existing.code,
        status: existing.status,
        hold_expires_at: existing.hold_expires_at,
      },
      { headers: rateLimitHeaders(limit) },
    );
  }

  const { data, error } = await supabase.rpc('create_booking_hold', {
    p_space_id: input.space_id,
    p_starts_at: input.starts_at,
    p_ends_at: input.ends_at,
    p_vehicle_id: input.vehicle_id ?? null,
    p_coupon_code: input.coupon_code || null,
    p_use_wallet: input.use_wallet,
    p_notes: input.notes || null,
  });

  if (error) {
    console.error('[bookings] hold failed', error.message);
    return NextResponse.json(new AppError('UNKNOWN').toResponseBody(), { status: 500 });
  }

  const result = data as { ok: boolean; error?: string; booking_id?: string };

  if (!result.ok) {
    const code = isAppErrorCode(result.error) ? result.error : 'UNKNOWN';
    const appError = new AppError(code, result as Record<string, unknown>);
    return NextResponse.json(appError.toResponseBody(), {
      status: appError.status,
      headers: rateLimitHeaders(limit),
    });
  }

  return NextResponse.json(result, { status: 201, headers: rateLimitHeaders(limit) });
}

/** The signed-in user's bookings, newest first. */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(new AppError('NOT_AUTHENTICATED').toResponseBody(), { status: 401 });
  }

  const scope = request.nextUrl.searchParams.get('scope') ?? 'driver';
  const status = request.nextUrl.searchParams.get('status');

  let query = supabase
    .from('bookings')
    .select('*')
    .order('starts_at', { ascending: false })
    .limit(100);

  query = scope === 'host' ? query.eq('host_id', user.id) : query.eq('driver_id', user.id);
  if (status) query = query.eq('status', status);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json(new AppError('UNKNOWN').toResponseBody(), { status: 500 });
  }

  return NextResponse.json({ ok: true, bookings: data ?? [] });
}
