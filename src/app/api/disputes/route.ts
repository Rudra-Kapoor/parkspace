import { NextResponse, type NextRequest } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { disputeSchema } from '@/lib/validation';
import { AppError } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Priority ladder.
 *
 * P0 is anything where somebody could be hurt or a vehicle is at risk right now.
 * It exists as a separate tier because a support queue sorted only by age will
 * eventually put a person standing in an unsafe car park at midnight behind
 * forty billing questions.
 */
const PRIORITY: Record<string, number> = {
  unsafe_location: 0,
  vehicle_damage: 0,
  property_damage: 0,

  space_unavailable: 1,
  access_failure: 1,
  vehicle_blocked: 1,
  host_no_show: 1,
  wrong_location: 1,

  overcharged: 2,
  space_too_small: 2,
  driver_no_show: 2,

  other: 3,
};

export async function POST(request: NextRequest) {
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

  const parsed = disputeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(new AppError('VALIDATION_FAILED').toResponseBody(), { status: 400 });
  }

  const { data: booking } = await supabase
    .from('bookings')
    .select('id, code, driver_id, host_id, status')
    .eq('id', parsed.data.booking_id)
    .maybeSingle();

  if (!booking) {
    return NextResponse.json(new AppError('BOOKING_NOT_FOUND').toResponseBody(), { status: 404 });
  }

  const isDriver = booking.driver_id === user.id;
  const isHost = booking.host_id === user.id;

  if (!isDriver && !isHost) {
    return NextResponse.json(new AppError('NOT_AUTHORIZED').toResponseBody(), { status: 403 });
  }

  const priority = PRIORITY[parsed.data.category] ?? 3;

  const { data: dispute, error } = await supabase
    .from('disputes')
    .insert({
      booking_id: booking.id,
      raised_by: user.id,
      against_id: isDriver ? booking.host_id : booking.driver_id,
      category: parsed.data.category,
      description: parsed.data.description,
      evidence_paths: parsed.data.evidence_paths,
      priority,
    })
    .select()
    .single();

  if (error) {
    console.error('[disputes] insert failed', error.message);
    return NextResponse.json(new AppError('UNKNOWN').toResponseBody(), { status: 500 });
  }

  // Move the booking to disputed where the state machine allows it, so it stops
  // flowing through the normal completion path while it is being looked at.
  if (['confirmed', 'active', 'completed'].includes(booking.status)) {
    const service = createServiceClient();
    await service.from('bookings').update({ status: 'disputed' }).eq('id', booking.id);
  }

  return NextResponse.json({ ok: true, dispute }, { status: 201 });
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(new AppError('NOT_AUTHENTICATED').toResponseBody(), { status: 401 });
  }

  // RLS restricts this to disputes the caller is party to.
  const { data, error } = await supabase
    .from('disputes')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json(new AppError('UNKNOWN').toResponseBody(), { status: 500 });
  }

  return NextResponse.json({ ok: true, disputes: data ?? [] });
}
