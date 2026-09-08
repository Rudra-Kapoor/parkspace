import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getPaymentProvider } from '@/lib/payments';
import { callerKey, LIMITS, rateLimit, rateLimitHeaders } from '@/lib/rate-limit';
import { AppError } from '@/lib/errors';
import { uuidSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  booking_id: uuidSchema,
  idempotency_key: z.string().min(8).max(100),
});

/**
 * Create a payment intent for a held booking.
 *
 * Note what is NOT trusted here: the amount. It is read from the booking row,
 * never from the request. A client that could name its own price would be able
 * to buy a month of parking for one rupee.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(new AppError('NOT_AUTHENTICATED').toResponseBody(), { status: 401 });
  }

  const limit = rateLimit(callerKey(request, user.id), LIMITS.payment.limit, LIMITS.payment.windowMs);
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

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(new AppError('VALIDATION_FAILED').toResponseBody(), { status: 400 });
  }

  // RLS limits this to the caller's own bookings.
  const { data: booking } = await supabase
    .from('bookings')
    .select('id, code, status, total_amount_paise, currency, hold_expires_at, driver_id')
    .eq('id', parsed.data.booking_id)
    .single();

  if (!booking) {
    return NextResponse.json(new AppError('BOOKING_NOT_FOUND').toResponseBody(), { status: 404 });
  }

  if (booking.driver_id !== user.id) {
    return NextResponse.json(new AppError('NOT_AUTHORIZED').toResponseBody(), { status: 403 });
  }

  if (booking.status !== 'pending') {
    return NextResponse.json(new AppError('BOOKING_NOT_PENDING').toResponseBody(), { status: 409 });
  }

  // A fully wallet-funded booking has nothing to charge. Confirm it directly
  // rather than sending a zero-rupee order to a gateway that will reject it.
  if (booking.total_amount_paise === 0) {
    const service = createServiceClient();
    const { data: confirmed } = await service.rpc('confirm_booking', {
      p_booking_id: booking.id,
      p_payment_id: null,
    });
    return NextResponse.json({ ok: true, zero_amount: true, confirmed });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, email, phone')
    .eq('id', user.id)
    .single();

  const provider = getPaymentProvider();

  let intent;
  try {
    intent = await provider.createIntent({
      bookingId: booking.id,
      bookingCode: booking.code,
      amount: booking.total_amount_paise,
      currency: booking.currency,
      idempotencyKey: parsed.data.idempotency_key,
      customer: {
        id: user.id,
        name: profile?.full_name ?? null,
        email: profile?.email ?? user.email ?? null,
        phone: profile?.phone ?? null,
      },
      notes: { booking_code: booking.code },
    });
  } catch (error) {
    console.error('[payments] intent creation failed', error);
    return NextResponse.json(new AppError('UPSTREAM_UNAVAILABLE').toResponseBody(), { status: 503 });
  }

  // Record the attempt with the service role: the payments table is not writable
  // by a client, deliberately.
  const service = createServiceClient();
  const { error: insertError } = await service.from('payments').insert({
    booking_id: booking.id,
    payer_id: user.id,
    provider: provider.name,
    provider_order_id: intent.providerOrderId,
    amount_paise: intent.amount,
    currency: intent.currency,
    status: 'created',
    idempotency_key: parsed.data.idempotency_key,
  });

  // A duplicate idempotency key means this exact intent was already recorded.
  // That is the retry case working correctly, not a failure.
  if (insertError && insertError.code !== '23505') {
    console.error('[payments] could not record payment', insertError.message);
  }

  return NextResponse.json(
    { ok: true, intent: intent.clientPayload, booking_code: booking.code },
    { headers: rateLimitHeaders(limit) },
  );
}
