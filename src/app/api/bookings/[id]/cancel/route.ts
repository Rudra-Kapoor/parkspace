import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { cancelRequestSchema } from '@/lib/validation';
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

  let reason = '';
  try {
    const parsed = cancelRequestSchema.safeParse(await request.json());
    if (parsed.success) reason = parsed.data.reason ?? '';
  } catch {
    // An empty body is fine; a reason is optional.
  }

  // cancel_booking works out who is cancelling from auth.uid() and applies the
  // policy itself, so the caller cannot choose a more generous refund.
  const { data, error } = await supabase.rpc('cancel_booking', {
    p_booking_id: id,
    p_reason: reason || null,
  });

  if (error) {
    console.error('[cancel] rpc failed', error.message);
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
