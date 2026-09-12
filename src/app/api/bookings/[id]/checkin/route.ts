import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkInSchema } from '@/lib/validation';
import { AppError, isAppErrorCode } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Check in.
 *
 * The coordinate is optional and the check-in succeeds without it. Refusing to
 * let someone start their booking because a basement has no GPS fix would be a
 * product that fails exactly where parking actually happens.
 *
 * The coordinate, when present, is stored and the distance from the true space
 * location is computed. A large distance is a fraud signal for review, not a
 * reason to block the driver standing at the gate.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(new AppError('NOT_AUTHENTICATED').toResponseBody(), { status: 401 });
  }

  let lat: number | null = null;
  let lng: number | null = null;
  try {
    const parsed = checkInSchema.safeParse(await request.json());
    if (parsed.success) {
      lat = parsed.data.lat ?? null;
      lng = parsed.data.lng ?? null;
    }
  } catch {
    // No body, no coordinate. Still a valid check-in.
  }

  const { data, error } = await supabase.rpc('check_in_booking', {
    p_booking_id: id,
    p_lat: lat,
    p_lng: lng,
  });

  if (error) {
    return NextResponse.json(new AppError('UNKNOWN').toResponseBody(), { status: 500 });
  }

  const result = data as { ok: boolean; error?: string };
  if (!result.ok) {
    const appError = new AppError(
      isAppErrorCode(result.error) ? result.error : 'UNKNOWN',
      result as Record<string, unknown>,
    );
    return NextResponse.json(appError.toResponseBody(), { status: appError.status });
  }

  return NextResponse.json(result);
}
