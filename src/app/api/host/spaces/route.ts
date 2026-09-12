import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { availabilityRuleSchema, fieldErrors, listingSubmitSchema } from '@/lib/validation';
import { AppError } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Host listings.
 *
 * POST creates a listing and submits it for moderation in one call. A listing
 * never reaches 'active' from here: a database trigger refuses any transition
 * into 'active' that did not come from moderation, so a host cannot self
 * approve even if this route were compromised.
 */

const availabilityArraySchema = z.array(availabilityRuleSchema).max(60).optional();

/** Blank strings arrive from form inputs and must become SQL nulls, not ''. */
function nullable(value: string | undefined | null): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export async function POST(request: NextRequest) {
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

  const parsed = listingSubmitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ...new AppError('VALIDATION_FAILED').toResponseBody(), fields: fieldErrors(parsed.error) },
      { status: 400 },
    );
  }

  const rawAvailability =
    typeof body === 'object' && body !== null
      ? (body as Record<string, unknown>).availability
      : undefined;
  const availabilityParsed = availabilityArraySchema.safeParse(rawAvailability);
  if (!availabilityParsed.success) {
    return NextResponse.json(
      {
        ...new AppError('VALIDATION_FAILED').toResponseBody(),
        fields: fieldErrors(availabilityParsed.error),
      },
      { status: 400 },
    );
  }

  const listing = parsed.data;

  try {
    // -------------------------------------------------------------------------
    // A host profile is a prerequisite for a listing, so it is created here
    // rather than being another form standing between a willing host and their
    // first listing. They can refine the display name afterwards.
    // -------------------------------------------------------------------------
    const { data: existingHostProfile } = await supabase
      .from('host_profiles')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!existingHostProfile) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .maybeSingle();

      const displayName =
        (profile as { full_name: string | null } | null)?.full_name?.trim() || 'ParkSpace host';

      const { error: hostProfileError } = await supabase
        .from('host_profiles')
        .upsert({ user_id: user.id, display_name: displayName }, { onConflict: 'user_id' });

      if (hostProfileError) {
        console.error('[host/spaces] host profile upsert failed', hostProfileError.message);
      }
    }

    // -------------------------------------------------------------------------
    // Promote the account to a host.
    //
    // profiles.role is guarded against self-update by a trigger, so this goes
    // through the service client. Note that the same trigger only exempts a
    // full admin, so on a database where the guard is in force this is a
    // best-effort promotion: the listing is created either way and nothing the
    // host can see depends on it.
    // -------------------------------------------------------------------------
    try {
      const service = createServiceClient();
      const { data: profileRow } = await service
        .from('profiles')
        .select('role, roles')
        .eq('id', user.id)
        .maybeSingle();

      const currentRole = (profileRow as { role?: string } | null)?.role ?? 'driver';
      const currentRoles = (profileRow as { roles?: string[] } | null)?.roles ?? ['driver'];

      if (currentRole === 'driver' || !currentRoles.includes('host')) {
        const nextRoles = currentRoles.includes('host') ? currentRoles : [...currentRoles, 'host'];
        await service
          .from('profiles')
          .update({
            role: currentRole === 'driver' ? 'host' : currentRole,
            roles: nextRoles,
          })
          .eq('id', user.id);
      }
    } catch (error) {
      console.error(
        '[host/spaces] role promotion skipped',
        error instanceof Error ? error.message : error,
      );
    }

    // -------------------------------------------------------------------------
    // The listing itself.
    // -------------------------------------------------------------------------
    const { data: inserted, error: insertError } = await supabase
      .from('parking_spaces')
      .insert({
        host_id: user.id,
        status: 'pending_review',
        title: listing.title,
        description: nullable(listing.description),
        address_line: listing.address_line,
        landmark: nullable(listing.landmark),
        locality: listing.locality,
        city: listing.city,
        state: listing.state,
        postal_code: nullable(listing.postal_code),
        lat: listing.lat,
        lng: listing.lng,
        space_type: listing.space_type,
        vehicle_types: listing.vehicle_types,
        capacity: listing.capacity,
        max_length_mm: listing.max_length_mm ?? null,
        max_width_mm: listing.max_width_mm ?? null,
        max_height_mm: listing.max_height_mm ?? null,
        amenities: listing.amenities,
        rules: listing.rules,
        price_hourly_paise: listing.price_hourly_paise ?? null,
        price_daily_paise: listing.price_daily_paise ?? null,
        price_monthly_paise: listing.price_monthly_paise ?? null,
        min_booking_minutes: listing.min_booking_minutes,
        max_booking_minutes: listing.max_booking_minutes ?? null,
        min_notice_minutes: listing.min_notice_minutes,
        max_advance_days: listing.max_advance_days,
        instant_book: listing.instant_book,
        cancellation_policy: listing.cancellation_policy,
        access_method: listing.access_method,
        access_instructions: nullable(listing.access_instructions),
        access_pin: nullable(listing.access_pin),
        has_ev_charging: listing.has_ev_charging,
        ev_connector_type: nullable(listing.ev_connector_type),
        ev_power_kw: listing.ev_power_kw ?? null,
        ev_price_per_kwh_paise: listing.ev_price_per_kwh_paise ?? null,
      })
      .select('id')
      .single();

    if (insertError || !inserted) {
      console.error('[host/spaces] insert failed', insertError?.message);
      return NextResponse.json(new AppError('UNKNOWN').toResponseBody(), { status: 500 });
    }

    const spaceId = (inserted as { id: string }).id;

    // -------------------------------------------------------------------------
    // The weekly availability pattern. Without at least one rule the space can
    // never be booked, so a failure here is worth reporting rather than
    // swallowing, but the listing itself stays: it is editable.
    // -------------------------------------------------------------------------
    const availability = availabilityParsed.data ?? [];
    if (availability.length > 0) {
      const { error: rulesError } = await supabase.from('availability_rules').insert(
        availability.map((rule) => ({
          space_id: spaceId,
          day_of_week: rule.day_of_week,
          start_time: rule.start_time,
          end_time: rule.end_time,
          ends_next_day: rule.ends_next_day,
        })),
      );

      if (rulesError) {
        console.error('[host/spaces] availability insert failed', rulesError.message);
        return NextResponse.json(
          {
            ok: true,
            id: spaceId,
            warning:
              'The listing was saved, but the weekly opening hours were not. Set them from the calendar before it goes live.',
          },
          { status: 201 },
        );
      }
    }

    return NextResponse.json({ ok: true, id: spaceId }, { status: 201 });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(error.toResponseBody(), { status: error.status });
    }
    console.error('[host/spaces] unexpected', error instanceof Error ? error.message : error);
    return NextResponse.json(new AppError('UNKNOWN').toResponseBody(), { status: 500 });
  }
}

/** The signed-in host's own listings. RLS scopes this without a filter, but the
 *  explicit host_id keeps it honest and lets an admin session use the route. */
export async function GET() {
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
    .select(
      'id, title, slug, status, locality, city, space_type, vehicle_types, capacity, max_height_mm, price_hourly_paise, price_daily_paise, price_monthly_paise, instant_book, avg_rating, review_count, booking_count, created_at, published_at',
    )
    .eq('host_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[host/spaces] list failed', error.message);
    return NextResponse.json(new AppError('UNKNOWN').toResponseBody(), { status: 500 });
  }

  return NextResponse.json({ ok: true, spaces: data ?? [] });
}
