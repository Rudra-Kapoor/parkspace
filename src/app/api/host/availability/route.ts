import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { availabilityBlockSchema, fieldErrors, uuidSchema } from '@/lib/validation';
import { AppError } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Availability blocks: the blackouts that override the weekly pattern.
 *
 * A block is how a host says "not this weekend" without dismantling their
 * opening hours. RLS restricts both statements to the owner of the space, so
 * the space_id in the body cannot be used to close somebody else's inventory.
 */

const createSchema = z.object({ space_id: uuidSchema }).and(availabilityBlockSchema);

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

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ...new AppError('VALIDATION_FAILED').toResponseBody(), fields: fieldErrors(parsed.error) },
      { status: 400 },
    );
  }

  const input = parsed.data;

  const { data, error } = await supabase
    .from('availability_blocks')
    .insert({
      space_id: input.space_id,
      starts_at: input.starts_at,
      ends_at: input.ends_at,
      reason: input.reason?.trim() || null,
      created_by: user.id,
    })
    .select('id, starts_at, ends_at, reason')
    .single();

  if (error) {
    console.error('[host/availability] insert failed', error.message);
    // A policy refusal and a missing space both surface as an empty result set
    // through PostgREST, and neither is worth distinguishing to the caller.
    if (error.code === '42501') {
      return NextResponse.json(new AppError('NOT_AUTHORIZED').toResponseBody(), { status: 403 });
    }
    return NextResponse.json(new AppError('UNKNOWN').toResponseBody(), { status: 500 });
  }

  return NextResponse.json({ ok: true, block: data }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
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

  // Accept the id from the query string or the body, because a fetch with a
  // DELETE and a body is awkward in some clients and both are unambiguous here.
  let id = request.nextUrl.searchParams.get('id');
  if (!id) {
    try {
      const body = (await request.json()) as { id?: string };
      id = body.id ?? null;
    } catch {
      id = null;
    }
  }

  const parsedId = uuidSchema.safeParse(id);
  if (!parsedId.success) {
    return NextResponse.json(new AppError('VALIDATION_FAILED').toResponseBody(), { status: 400 });
  }

  const { data, error } = await supabase
    .from('availability_blocks')
    .delete()
    .eq('id', parsedId.data)
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('[host/availability] delete failed', error.message);
    return NextResponse.json(new AppError('UNKNOWN').toResponseBody(), { status: 500 });
  }
  if (!data) {
    return NextResponse.json(new AppError('NOT_AUTHORIZED').toResponseBody(), { status: 403 });
  }

  return NextResponse.json({ ok: true, id: parsedId.data });
}
