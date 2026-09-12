import { NextResponse, type NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getPaymentProvider } from '@/lib/payments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Payment webhook.
 *
 * This is the only thing in the system permitted to move a booking to confirmed.
 * The browser callback after the checkout sheet closes is not trusted for that,
 * because whoever controls the browser controls what it sends.
 *
 * The rules this handler follows, and why each one matters:
 *
 * 1. Read the raw body as text and verify the signature over those exact bytes.
 *    Parsing first and re-serialising changes key order and whitespace, and the
 *    signature will not match.
 *
 * 2. Record every event, valid or not, before acting on it. An invalid signature
 *    is a security signal worth keeping.
 *
 * 3. Deduplicate on the provider's own event id. Gateways retry, sometimes for
 *    days. The unique constraint on (provider, provider_event_id) turns at-least
 *    once delivery into exactly-once processing.
 *
 * 4. Always answer 200 once the event is durably recorded, even if downstream
 *    processing fails. A non-200 makes the gateway retry, and retrying will not
 *    fix a logic error. Failures are left on the row for a human to reconcile.
 *
 * 5. Never trust the amount in the payload as authoritative for what to confirm.
 *    It is compared against the booking, and a mismatch is flagged rather than
 *    silently accepted.
 */
export async function POST(request: NextRequest) {
  const provider = getPaymentProvider();

  // Step 1: raw bytes.
  const rawBody = await request.text();

  const headers: Record<string, string | null> = {
    'x-razorpay-signature': request.headers.get('x-razorpay-signature'),
    'x-parkspace-mock-signature': request.headers.get('x-parkspace-mock-signature'),
  };

  const event = provider.verifyWebhook({ rawBody, headers });
  const service = createServiceClient();

  // Step 2: record the attempt, including failures.
  if (!event) {
    await service.from('webhook_events').insert({
      provider: provider.name,
      provider_event_id: `invalid_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      event_type: 'signature_invalid',
      signature_valid: false,
      payload: { raw: rawBody.slice(0, 2000) },
      processing_error: 'Signature verification failed',
    });

    console.warn('[webhook] rejected an event with an invalid signature');
    return NextResponse.json({ ok: false, error: 'SIGNATURE_INVALID' }, { status: 400 });
  }

  // Step 3: deduplicate.
  const { error: dedupeError } = await service.from('webhook_events').insert({
    provider: provider.name,
    provider_event_id: event.eventId,
    event_type: event.eventType,
    signature_valid: true,
    payload: event.payload as Record<string, unknown>,
  });

  if (dedupeError) {
    if (dedupeError.code === '23505') {
      // Already seen. This is the retry path working correctly.
      return NextResponse.json({ ok: true, duplicate: true });
    }
    console.error('[webhook] could not record event', dedupeError.message);
    // Not recorded durably, so ask for a retry.
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  // Step 4: from here on, always answer 200 and record any failure on the row.
  let processingError: string | null = null;

  try {
    if (event.status === 'captured' || event.status === 'authorized') {
      await handleSuccessfulPayment(service, event, provider.name);
    } else if (event.status === 'failed') {
      await handleFailedPayment(service, event, provider.name);
    }
    // 'refunded' and 'ignored' are recorded but need no booking state change:
    // refunds are driven from our side and already tracked in the refunds table.
  } catch (error) {
    processingError = error instanceof Error ? error.message : String(error);
    console.error('[webhook] processing failed', processingError);
  }

  await service
    .from('webhook_events')
    .update({ processed_at: new Date().toISOString(), processing_error: processingError })
    .eq('provider', provider.name)
    .eq('provider_event_id', event.eventId);

  return NextResponse.json({ ok: true, processed: processingError === null });
}

type ServiceClient = ReturnType<typeof createServiceClient>;

async function handleSuccessfulPayment(
  service: ServiceClient,
  event: NonNullable<ReturnType<ReturnType<typeof getPaymentProvider>['verifyWebhook']>>,
  providerName: string,
): Promise<void> {
  if (!event.providerOrderId) {
    throw new Error('Captured event carried no order id, cannot match a booking');
  }

  const { data: payment } = await service
    .from('payments')
    .select('id, booking_id, amount_paise, status')
    .eq('provider', providerName)
    .eq('provider_order_id', event.providerOrderId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!payment) {
    throw new Error(`No payment row for order ${event.providerOrderId}`);
  }

  // Step 5: the amount must match what we asked for.
  if (event.amount != null && event.amount !== payment.amount_paise) {
    throw new Error(
      `Amount mismatch on ${event.providerOrderId}: gateway says ${event.amount}, ` +
        `booking says ${payment.amount_paise}. Not confirming. Needs manual reconciliation.`,
    );
  }

  // Idempotent: a second capture event for an already-captured payment is a
  // no-op rather than an error.
  if (payment.status !== 'captured') {
    await service
      .from('payments')
      .update({
        status: event.status === 'captured' ? 'captured' : 'authorized',
        provider_payment_id: event.providerPaymentId,
        method: event.method,
        captured_at: event.status === 'captured' ? new Date().toISOString() : null,
        authorized_at: new Date().toISOString(),
        raw_payload: event.payload as Record<string, unknown>,
      })
      .eq('id', payment.id);
  }

  if (event.status !== 'captured') return;

  const { data: confirmed, error } = await service.rpc('confirm_booking', {
    p_booking_id: payment.booking_id,
    p_payment_id: payment.id,
  });

  if (error) throw new Error(`confirm_booking failed: ${error.message}`);

  const result = confirmed as { ok: boolean; error?: string; already?: boolean };

  if (!result.ok) {
    // The most serious case in the whole system: money taken, booking not
    // confirmable. Usually the hold lapsed and the bay was resold. It must never
    // be swallowed, because a human has to refund it.
    throw new Error(
      `PAYMENT TAKEN BUT BOOKING NOT CONFIRMED. booking=${payment.booking_id} ` +
        `payment=${payment.id} reason=${result.error}. Refund required.`,
    );
  }

  if (!result.already) {
    await queueBookingNotifications(service, payment.booking_id);
  }
}

async function handleFailedPayment(
  service: ServiceClient,
  event: NonNullable<ReturnType<ReturnType<typeof getPaymentProvider>['verifyWebhook']>>,
  providerName: string,
): Promise<void> {
  if (!event.providerOrderId) return;

  await service
    .from('payments')
    .update({
      status: 'failed',
      provider_payment_id: event.providerPaymentId,
      failure_code: event.failureCode,
      failure_reason: event.failureReason,
      raw_payload: event.payload as Record<string, unknown>,
    })
    .eq('provider', providerName)
    .eq('provider_order_id', event.providerOrderId);

  // The hold is deliberately left alone. The driver may retry with another
  // method, and releasing the bay the instant a card is declined would mean
  // losing the space while reaching for a second card. The sweeper expires it
  // at the normal time if no payment lands.
}

/**
 * Queue the notifications a confirmed booking should produce.
 *
 * Written as rows rather than sent inline, because a failing email provider must
 * never roll back a confirmed booking. A worker drains the table.
 */
async function queueBookingNotifications(service: ServiceClient, bookingId: string): Promise<void> {
  const { data: booking } = await service
    .from('bookings')
    .select('id, code, driver_id, host_id, starts_at, ends_at, space_id, total_amount_paise')
    .eq('id', bookingId)
    .single();

  if (!booking) return;

  const startsAt = new Date(booking.starts_at);

  const rows: Array<Record<string, unknown>> = [
    {
      user_id: booking.driver_id,
      channel: 'in_app',
      template_key: 'booking_confirmed_driver',
      title: 'Your parking is booked',
      body: `Booking ${booking.code} is confirmed. Your access details will appear here 24 hours before you arrive.`,
      action_url: `/bookings/${booking.id}`,
      data: { booking_id: booking.id },
      dedupe_key: `confirmed:driver:${booking.id}`,
    },
    {
      user_id: booking.host_id,
      channel: 'in_app',
      template_key: 'booking_confirmed_host',
      title: 'You have a new booking',
      body: `Booking ${booking.code} starts ${startsAt.toLocaleString('en-IN')}.`,
      action_url: `/host/bookings`,
      data: { booking_id: booking.id },
      dedupe_key: `confirmed:host:${booking.id}`,
    },
    // Reminders, scheduled rather than sent.
    {
      user_id: booking.driver_id,
      channel: 'push',
      template_key: 'booking_reminder_day',
      title: 'Parking tomorrow',
      body: `Your booking ${booking.code} starts tomorrow. Access details are now available.`,
      action_url: `/bookings/${booking.id}`,
      data: { booking_id: booking.id },
      send_after: new Date(startsAt.getTime() - 24 * 60 * 60 * 1000).toISOString(),
      dedupe_key: `remind24:${booking.id}`,
    },
    {
      user_id: booking.driver_id,
      channel: 'push',
      template_key: 'booking_reminder_soon',
      title: 'Your parking space is ready',
      body: `Booking ${booking.code} starts in 30 minutes.`,
      action_url: `/bookings/${booking.id}`,
      data: { booking_id: booking.id },
      send_after: new Date(startsAt.getTime() - 30 * 60 * 1000).toISOString(),
      dedupe_key: `remind30m:${booking.id}`,
    },
    {
      user_id: booking.driver_id,
      channel: 'push',
      template_key: 'booking_ending_soon',
      title: 'Your booking ends soon',
      body: `Booking ${booking.code} ends in 15 minutes. Extend it if you need longer.`,
      action_url: `/bookings/${booking.id}`,
      data: { booking_id: booking.id },
      send_after: new Date(new Date(booking.ends_at).getTime() - 15 * 60 * 1000).toISOString(),
      dedupe_key: `endingsoon:${booking.id}`,
    },
  ];

  // Past-dated reminders are dropped rather than fired immediately, which is
  // what stops a last-minute booking from sending "parking tomorrow" instantly.
  const now = Date.now();
  const keep = rows.filter(
    (row) => !row.send_after || new Date(row.send_after as string).getTime() > now,
  );

  await service.from('notifications').insert(keep);
}
