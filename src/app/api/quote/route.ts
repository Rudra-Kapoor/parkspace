import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { quoteRequestSchema, fieldErrors } from '@/lib/validation';
import { callerKey, LIMITS, rateLimit, rateLimitHeaders } from '@/lib/rate-limit';
import { AppError } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Price a prospective booking.
 *
 * Calls quote_booking() in the database rather than computing in TypeScript.
 * The client has an identical implementation in lib/money for live preview while
 * a slider moves, but this is the number that binds, and the checkout flow
 * re-quotes here immediately before taking any money.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const limit = rateLimit(callerKey(request, user?.id), LIMITS.quote.limit, LIMITS.quote.windowMs);
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

  const parsed = quoteRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ...new AppError('VALIDATION_FAILED').toResponseBody(), fields: fieldErrors(parsed.error) },
      { status: 400 },
    );
  }

  const input = parsed.data;

  const { data, error } = await supabase.rpc('quote_booking', {
    p_space_id: input.space_id,
    p_starts_at: input.starts_at,
    p_ends_at: input.ends_at,
    p_coupon_code: input.coupon_code || null,
    p_use_wallet: input.use_wallet,
    p_user_id: user?.id ?? null,
  });

  if (error) {
    console.error('[quote] rpc failed', error.message);
    return NextResponse.json(new AppError('UNKNOWN').toResponseBody(), { status: 500 });
  }

  return NextResponse.json(data, { headers: rateLimitHeaders(limit) });
}
