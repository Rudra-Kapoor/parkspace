import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { fieldErrors, listingDraftSchema, uuidSchema } from '@/lib/validation';
import { AppError } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * One listing.
 *
 * Ownership is not checked here, deliberately. Row Level Security restricts
 * every one of these statements to the host who owns the row (or an admin), so
 * a missing `eq('host_id', ...)` cannot widen access. Adding a redundant filter
 * would imply the policy is not trusted, and a policy nobody trusts is a policy
 * that eventually gets bypassed.
 */

const patchSchema = listingDraftSchema.partial();

function nullable(value: string | undefined | null): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

async function resolveId(context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return uuidSchema.safeParse(id);
}

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const parsedId = await resolveId(context);
  if (!parsedId.success) {
    return NextResponse.json(new AppError('SPACE_NOT_FOUND').toResponseBody(), { status: 404 });
  }

  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return NextResponse.json(new AppError('NOT_CONFIGURED').toResponseBody(), { status: 503 });
  }

  // public_spaces carries the conditional address release but no moderation
  // state, so status comes from the base table alongside it.
  const [viewResult, statusResult, availabilityResult] = await Promise.all([
    supabase.from('public_spaces').select('*').eq('id', parsedId.data).maybeSingle(),
    supabase.from('parking_spaces').select('status').eq('id', parsedId.data).maybeSingle(),
    supabase
      .from('availability_rules')
      .select('id, day_of_week, start_time, end_time, ends_next_day')
      .eq('space_id', parsedId.data)
      .order('day_of_week'),
  ]);

  if (viewResult.error) {
    console.error('[host/spaces/:id] read failed', viewResult.error.message);
    return NextResponse.json(new AppError('UNKNOWN').toResponseBody(), { status: 500 });
  }
  if (!viewResult.data) {
    return NextResponse.json(new AppError('SPACE_NOT_FOUND').toResponseBody(), { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    space: {
      ...(viewResult.data as Record<string, unknown>),
      status: (statusResult.data as { status: string } | null)?.status ?? null,
    },
    availability: availabilityResult.data ?? [],
  });
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const parsedId = await resolveId(context);
  if (!parsedId.success) {
    return NextResponse.json(new AppError('SPACE_NOT_FOUND').toResponseBody(), { status: 404 });
  }

  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return NextResponse.json(new AppError('NOT_CONFIGURED').toResponseBody(), { status: 503 });
  }

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

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ...new AppError('VALIDATION_FAILED').toResponseBody(), fields: fieldErrors(parsed.error) },
      { status: 400 },
    );
  }

  const input = parsed.data;
  const update: Record<string, unknown> = {};

  const copyIfPresent = (key: keyof typeof input, column = key as string) => {
    if (input[key] !== undefined) update[column] = input[key];
  };

  copyIfPresent('title');
  copyIfPresent('locality');
  copyIfPresent('city');
  copyIfPresent('state');
  copyIfPresent('lat');
  copyIfPresent('lng');
  copyIfPresent('space_type');
  copyIfPresent('vehicle_types');
  copyIfPresent('capacity');
  copyIfPresent('amenities');
  copyIfPresent('rules');
  copyIfPresent('min_booking_minutes');
  copyIfPresent('min_notice_minutes');
  copyIfPresent('max_advance_days');
  copyIfPresent('instant_book');
  copyIfPresent('cancellation_policy');
  copyIfPresent('access_method');
  copyIfPresent('has_ev_charging');
  copyIfPresent('address_line');

  // Optional numerics: an explicit null clears the column, undefined leaves it.
  for (const key of [
    'max_length_mm',
    'max_width_mm',
    'max_height_mm',
    'price_hourly_paise',
    'price_daily_paise',
    'price_monthly_paise',
    'max_booking_minutes',
    'ev_power_kw',
    'ev_price_per_kwh_paise',
  ] as const) {
    if (input[key] !== undefined) update[key] = input[key] ?? null;
  }

  // Optional text: an empty string means "remove this", not "store a blank".
  for (const key of [
    'description',
    'landmark',
    'postal_code',
    'access_instructions',
    'access_pin',
    'ev_connector_type',
  ] as const) {
    if (input[key] !== undefined) update[key] = nullable(input[key]);
  }

  // A listing edited after rejection goes back into the queue rather than
  // sitting in a state the host cannot get out of.
  const statusRequest =
    typeof body === 'object' && body !== null
      ? (body as Record<string, unknown>).status
      : undefined;
  if (statusRequest === 'paused' || statusRequest === 'active' || statusRequest === 'pending_review') {
    update.status = statusRequest;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json(new AppError('VALIDATION_FAILED').toResponseBody(), { status: 400 });
  }

  const { data, error } = await supabase
    .from('parking_spaces')
    .update(update)
    .eq('id', parsedId.data)
    .select('id, status')
    .maybeSingle();

  if (error) {
    console.error('[host/spaces/:id] update failed', error.message);
    // The guard trigger raises check_violation when a host tries to move a
    // listing into a status only moderation may set.
    if (error.code === '23514' || /moderation/i.test(error.message)) {
      return NextResponse.json(new AppError('NOT_AUTHORIZED').toResponseBody(), { status: 403 });
    }
    return NextResponse.json(new AppError('UNKNOWN').toResponseBody(), { status: 500 });
  }

  if (!data) {
    return NextResponse.json(new AppError('SPACE_NOT_FOUND').toResponseBody(), { status: 404 });
  }

  return NextResponse.json({ ok: true, id: parsedId.data, status: (data as { status: string }).status });
}

/**
 * Delisting, not deleting.
 *
 * Bookings reference the space with ON DELETE RESTRICT, and a completed booking
 * has to keep pointing at the thing it was for: receipts, reviews and disputes
 * all depend on it. Delisting removes it from search and stops new bookings,
 * which is what a host actually means by "delete".
 */
export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const parsedId = await resolveId(context);
  if (!parsedId.success) {
    return NextResponse.json(new AppError('SPACE_NOT_FOUND').toResponseBody(), { status: 404 });
  }

  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return NextResponse.json(new AppError('NOT_CONFIGURED').toResponseBody(), { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(new AppError('NOT_AUTHENTICATED').toResponseBody(), { status: 401 });
  }

  const { data, error } = await supabase
    .from('parking_spaces')
    .update({ status: 'delisted' })
    .eq('id', parsedId.data)
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('[host/spaces/:id] delist failed', error.message);
    return NextResponse.json(new AppError('UNKNOWN').toResponseBody(), { status: 500 });
  }
  if (!data) {
    return NextResponse.json(new AppError('SPACE_NOT_FOUND').toResponseBody(), { status: 404 });
  }

  return NextResponse.json({ ok: true, id: parsedId.data, status: 'delisted' });
}
