import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAdmin, writeAuditLog } from '@/lib/admin';
import { fieldErrors } from '@/lib/validation';
import { AppError } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Coupons.
 *
 * The unit of `value` depends on the coupon type and is the single most likely
 * thing to get wrong here: basis points for a percent coupon, paise for a flat
 * one. The conversion from the human number happens in the form, which means
 * this route receives storage units and validates them as such. It also
 * re-checks the percent ceiling, because a client that sends 100000 basis
 * points is either broken or hostile and both deserve the same answer.
 */

const couponSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(3, 'A code needs at least 3 characters')
      .max(40)
      .regex(/^[A-Za-z0-9_-]+$/, 'Use letters, numbers, hyphens and underscores only')
      .transform((value) => value.toUpperCase()),
    description: z.string().trim().max(300).optional().or(z.literal('')),
    coupon_type: z.enum(['flat', 'percent']),
    /** Basis points for percent, paise for flat. */
    value: z.coerce.number().int().positive('The value must be more than zero'),
    max_discount_paise: z.coerce.number().int().positive().optional(),
    min_booking_paise: z.coerce.number().int().min(0).default(0),
    max_redemptions: z.coerce.number().int().positive().optional(),
    max_per_user: z.coerce.number().int().positive().default(1),
    new_users_only: z.coerce.boolean().default(false),
    first_booking_only: z.coerce.boolean().default(false),
    valid_from: z.string().optional(),
    valid_until: z.string().optional(),
    is_active: z.coerce.boolean().default(true),
  })
  .refine((value) => value.coupon_type !== 'percent' || value.value <= 10_000, {
    message: 'A percentage cannot exceed 100 percent, which is 10000 basis points',
    path: ['value'],
  })
  .refine(
    (value) =>
      !value.valid_from ||
      !value.valid_until ||
      new Date(value.valid_until) > new Date(value.valid_from),
    { message: 'The end of the window must be after the start', path: ['valid_until'] },
  );

export async function POST(request: NextRequest) {
  const gate = await requireAdmin(['admin']);
  if (!gate.ok) {
    return NextResponse.json(gate.error.toResponseBody(), { status: gate.error.status });
  }
  const admin = gate.context;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(new AppError('VALIDATION_FAILED').toResponseBody(), { status: 400 });
  }

  const parsed = couponSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ...new AppError('VALIDATION_FAILED').toResponseBody(), fields: fieldErrors(parsed.error) },
      { status: 400 },
    );
  }

  const input = parsed.data;

  try {
    const row = {
      code: input.code,
      description: input.description?.trim() || null,
      coupon_type: input.coupon_type,
      value: input.value,
      max_discount_paise: input.max_discount_paise ?? null,
      min_booking_paise: input.min_booking_paise,
      max_redemptions: input.max_redemptions ?? null,
      max_per_user: input.max_per_user,
      new_users_only: input.new_users_only,
      first_booking_only: input.first_booking_only,
      valid_from: input.valid_from ? new Date(input.valid_from).toISOString() : new Date().toISOString(),
      valid_until: input.valid_until ? new Date(input.valid_until).toISOString() : null,
      is_active: input.is_active,
      created_by: admin.userId,
    };

    const { data, error } = await admin.service
      .from('coupons')
      .insert(row)
      .select('id, code, coupon_type, value, is_active')
      .single();

    if (error) {
      // 23505 is the unique violation on code, which is a user error rather
      // than a fault, so it gets a sentence a human can act on.
      if (error.code === '23505') {
        return NextResponse.json(
          {
            ...new AppError('VALIDATION_FAILED').toResponseBody(),
            message: 'A coupon with that code already exists.',
            fields: { code: 'That code is taken' },
          },
          { status: 409 },
        );
      }
      throw new Error(error.message);
    }

    await writeAuditLog(
      admin,
      {
        action: 'coupon.create',
        entityType: 'coupon',
        entityId: (data as { id: string }).id,
        before: null,
        after: row,
      },
      request,
    );

    return NextResponse.json({ ok: true, coupon: data }, { status: 201 });
  } catch (error) {
    console.error('[admin/coupons] failed', error instanceof Error ? error.message : error);
    return NextResponse.json(new AppError('UNKNOWN').toResponseBody(), { status: 500 });
  }
}

export async function GET() {
  const gate = await requireAdmin(['admin', 'support']);
  if (!gate.ok) {
    return NextResponse.json(gate.error.toResponseBody(), { status: gate.error.status });
  }

  const { data, error } = await gate.context.service
    .from('coupons')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json(new AppError('UNKNOWN').toResponseBody(), { status: 500 });
  }

  return NextResponse.json({ ok: true, coupons: data ?? [] });
}
