import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { extendRequestSchema } from '@/lib/validation';
import { AppError, isAppErrorCode } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(new AppError('VALIDATION_FAILED').toResponseBody(), { status: 400 });
  }

  const parsed = extendRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(new AppError('VALIDATION_FAILED').toResponseBody(), { status: 400 });
  }

  const { data, error } = await supabase.rpc('extend_booking', {
    p_booking_id: id,
    p_new_ends_at: parsed.data.new_ends_at,
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
