import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getPaymentProvider, MockPaymentProvider } from '@/lib/payments';
import { AppError } from '@/lib/errors';
import { uuidSchema } from '@/lib/validation';
import { publicEnv } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  booking_id: uuidSchema,
  outcome: z.enum(['success', 'failure']),
});

/**
 * Complete a simulated payment.
 *
 * This exists only for the mock provider. It builds a correctly HMAC-signed
 * event and posts it to the real webhook endpoint, so the demonstration exercises
 * signature verification, replay deduplication, amount checking and
 * confirm_booking exactly as production would. Nothing here shortcuts into the
 * database.
 *
 * It refuses to run when a real gateway is configured, so it can never become a
 * way to confirm a booking without paying.
 */
export async function POST(request: NextRequest) {
  const provider = getPaymentProvider();

  if (provider.name !== 'mock') {
    return NextResponse.json(
      { ok: false, error: 'NOT_AUTHORIZED', message: 'A real payment provider is configured.' },
      { status: 403 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(new AppError('NOT_AUTHENTICATED').toResponseBody(), { status: 401 });
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

  // RLS restricts this to the caller's own bookings.
  const { data: booking } = await supabase
    .from('bookings')
    .select('id, driver_id, total_amount_paise, status')
    .eq('id', parsed.data.booking_id)
    .maybeSingle();

  if (!booking || booking.driver_id !== user.id) {
    return NextResponse.json(new AppError('BOOKING_NOT_FOUND').toResponseBody(), { status: 404 });
  }

  const { data: payment } = await supabase
    .from('payments')
    .select('provider_order_id, amount_paise')
    .eq('booking_id', booking.id)
    .eq('provider', 'mock')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!payment?.provider_order_id) {
    return NextResponse.json(
      { ...new AppError('PAYMENT_NOT_FOUND').toResponseBody(), message: 'Start the payment first.' },
      { status: 404 },
    );
  }

  const { body: eventBody, signature } = MockPaymentProvider.buildSignedEvent({
    eventType: parsed.data.outcome === 'success' ? 'payment.captured' : 'payment.failed',
    providerOrderId: payment.provider_order_id,
    amount: payment.amount_paise,
  });

  // Call our own webhook over HTTP rather than invoking the handler directly,
  // so the demonstration really does traverse the production path.
  let siteUrl = request.nextUrl.origin;
  try {
    siteUrl = publicEnv().NEXT_PUBLIC_SITE_URL || request.nextUrl.origin;
  } catch {
    // Fall back to the request origin.
  }

  try {
    const webhookResponse = await fetch(`${siteUrl}/api/payments/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-parkspace-mock-signature': signature,
      },
      body: eventBody,
      signal: AbortSignal.timeout(15_000),
    });

    const result = await webhookResponse.json();

    return NextResponse.json({
      ok: webhookResponse.ok,
      outcome: parsed.data.outcome,
      webhook: result,
    });
  } catch (error) {
    console.error('[mock-complete] webhook call failed', error);
    return NextResponse.json(
      { ...new AppError('UPSTREAM_UNAVAILABLE').toResponseBody() },
      { status: 503 },
    );
  }
}
