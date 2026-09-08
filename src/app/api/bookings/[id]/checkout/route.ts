import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { AppError, isAppErrorCode } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  _request: NextRequest,
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

  const { data, error } = await supabase.rpc('check_out_booking', { p_booking_id: id });

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
