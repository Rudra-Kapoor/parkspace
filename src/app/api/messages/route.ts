import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { messageSchema } from '@/lib/validation';
import { callerKey, LIMITS, rateLimit, rateLimitHeaders } from '@/lib/rate-limit';
import { AppError } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Booking messages.
 *
 * Scoped to a booking, so there is no way to message someone you have no
 * business with. RLS enforces that the sender is a participant; this route does
 * not need to check it, and deliberately does not duplicate the check, because
 * two places that must agree eventually stop agreeing.
 *
 * The database redacts phone numbers and email addresses on insert. That is
 * partly about keeping the transaction on-platform, and mostly about the fact
 * that moving a parking arrangement into a private WhatsApp thread removes every
 * protection either side has if it goes wrong.
 */
export async function GET(request: NextRequest) {
  const bookingId = request.nextUrl.searchParams.get('booking_id');

  if (!bookingId) {
    return NextResponse.json(new AppError('VALIDATION_FAILED').toResponseBody(), { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(new AppError('NOT_AUTHENTICATED').toResponseBody(), { status: 401 });
  }

  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: true })
    .limit(200);

  if (error) {
    return NextResponse.json(new AppError('UNKNOWN').toResponseBody(), { status: 500 });
  }

  // Mark the counterparty's messages as read. Best effort: a failure here must
  // not stop the thread from rendering.
  void supabase
    .from('messages')
    .update({ read_at: new Date().toISOString() })
    .eq('booking_id', bookingId)
    .neq('sender_id', user.id)
    .is('read_at', null)
    .then(
      () => undefined,
      () => undefined,
    );

  return NextResponse.json({ ok: true, messages: data ?? [] });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(new AppError('NOT_AUTHENTICATED').toResponseBody(), { status: 401 });
  }

  const limit = rateLimit(callerKey(request, user.id), LIMITS.message.limit, LIMITS.message.windowMs);
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

  const parsed = messageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(new AppError('VALIDATION_FAILED').toResponseBody(), { status: 400 });
  }

  const { data, error } = await supabase
    .from('messages')
    .insert({
      booking_id: parsed.data.booking_id,
      sender_id: user.id,
      body: parsed.data.body,
    })
    .select()
    .single();

  if (error) {
    // A policy violation here means the caller is not a participant of the
    // booking, which is the RLS check doing its job.
    return NextResponse.json(new AppError('NOT_AUTHORIZED').toResponseBody(), { status: 403 });
  }

  // Notify the other side. Queued as a row, not sent, in line with the rest of
  // the notification model.
  void supabase
    .from('bookings')
    .select('driver_id, host_id, code')
    .eq('id', parsed.data.booking_id)
    .single()
    .then(({ data: booking }) => {
      if (!booking) return;
      const recipient = booking.driver_id === user.id ? booking.host_id : booking.driver_id;

      return supabase.from('notifications').insert({
        user_id: recipient,
        channel: 'in_app',
        template_key: 'new_message',
        title: 'New message',
        body: `You have a message about booking ${booking.code}.`,
        action_url: `/bookings/${parsed.data.booking_id}`,
        data: { booking_id: parsed.data.booking_id },
      });
    })
    .then(
      () => undefined,
      () => undefined,
    );

  return NextResponse.json(
    { ok: true, message: data },
    { status: 201, headers: rateLimitHeaders(limit) },
  );
}
