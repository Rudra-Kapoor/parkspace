import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { fieldErrors, hostProfileSchema } from '@/lib/validation';
import { AppError } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The host profile.
 *
 * Only the fields a host is allowed to set are written. KYC status, superhost
 * status, balances and the reliability rates are all reset to their old values
 * by a database trigger on any non-admin update, so sending them here would be
 * silently ignored rather than dangerous, but not sending them is clearer.
 */
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

  const parsed = hostProfileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ...new AppError('VALIDATION_FAILED').toResponseBody(), fields: fieldErrors(parsed.error) },
      { status: 400 },
    );
  }

  const input = parsed.data;

  const { data, error } = await supabase
    .from('host_profiles')
    .upsert(
      {
        user_id: user.id,
        display_name: input.display_name.trim(),
        bio: input.bio?.trim() || null,
        is_business: input.is_business,
        business_name: input.is_business ? input.business_name?.trim() || null : null,
        business_type: input.is_business ? input.business_type?.trim() || null : null,
      },
      { onConflict: 'user_id' },
    )
    .select('user_id, display_name, bio, is_business, business_name, business_type, kyc_status')
    .single();

  if (error) {
    console.error('[host/profile] upsert failed', error.message);
    return NextResponse.json(new AppError('UNKNOWN').toResponseBody(), { status: 500 });
  }

  return NextResponse.json({ ok: true, host_profile: data });
}

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
    .from('host_profiles')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json(new AppError('UNKNOWN').toResponseBody(), { status: 500 });
  }

  return NextResponse.json({ ok: true, host_profile: data ?? null });
}
