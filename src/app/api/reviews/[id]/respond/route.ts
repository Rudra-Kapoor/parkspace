import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { fieldErrors, uuidSchema } from '@/lib/validation';
import { AppError } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * A host's public reply to a review about their space.
 *
 * The policy that permits this is narrow: subject_id must be the caller and the
 * direction must be driver_to_host. So a host can answer a review of them and
 * nothing else, and the rule is enforced by the database rather than by this
 * route remembering to check.
 *
 * One reply per review. Editing a published reply after the fact would let a
 * host quietly rewrite history under a review somebody already read.
 */

const respondSchema = z.object({
  response: z
    .string()
    .trim()
    .min(2, 'Write a reply')
    .max(1000, 'Keep your reply under 1000 characters'),
});

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const parsedId = uuidSchema.safeParse(id);
  if (!parsedId.success) {
    return NextResponse.json(new AppError('VALIDATION_FAILED').toResponseBody(), { status: 400 });
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

  const parsed = respondSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ...new AppError('VALIDATION_FAILED').toResponseBody(), fields: fieldErrors(parsed.error) },
      { status: 400 },
    );
  }

  const { data: existing, error: readError } = await supabase
    .from('reviews')
    .select('id, subject_id, direction, host_response')
    .eq('id', parsedId.data)
    .maybeSingle();

  if (readError) {
    console.error('[reviews/respond] read failed', readError.message);
    return NextResponse.json(new AppError('UNKNOWN').toResponseBody(), { status: 500 });
  }
  if (!existing) {
    return NextResponse.json(new AppError('NOT_AUTHORIZED').toResponseBody(), { status: 404 });
  }

  const review = existing as {
    subject_id: string;
    direction: string;
    host_response: string | null;
  };

  if (review.subject_id !== user.id || review.direction !== 'driver_to_host') {
    return NextResponse.json(new AppError('NOT_AUTHORIZED').toResponseBody(), { status: 403 });
  }
  if (review.host_response) {
    return NextResponse.json(
      {
        ...new AppError('VALIDATION_FAILED').toResponseBody(),
        message: 'You have already replied to this review.',
      },
      { status: 409 },
    );
  }

  const { data, error } = await supabase
    .from('reviews')
    .update({
      host_response: parsed.data.response,
      host_responded_at: new Date().toISOString(),
    })
    .eq('id', parsedId.data)
    .select('id, host_response, host_responded_at')
    .maybeSingle();

  if (error) {
    console.error('[reviews/respond] update failed', error.message);
    return NextResponse.json(new AppError('UNKNOWN').toResponseBody(), { status: 500 });
  }
  if (!data) {
    return NextResponse.json(new AppError('NOT_AUTHORIZED').toResponseBody(), { status: 403 });
  }

  return NextResponse.json({ ok: true, review: data });
}
