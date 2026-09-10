import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { notifyUser, requireAdmin, writeAuditLog } from '@/lib/admin';
import { fieldErrors, uuidSchema } from '@/lib/validation';
import { AppError } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Suspend or reinstate an account.
 *
 * Suspension is the heaviest lever in the panel: it stops the person booking,
 * hosting and signing in to anything useful, and it hides them from the public
 * profile view. So it takes a reason, it is always audited, and it is always
 * reversible from the same screen.
 *
 * An admin cannot suspend themselves. That is not paternalism, it is the only
 * cheap protection against locking the last administrator out of the panel.
 */

const suspendSchema = z
  .object({
    action: z.enum(['suspend', 'unsuspend']),
    reason: z.string().trim().max(500).optional(),
  })
  .refine((value) => value.action !== 'suspend' || (value.reason?.length ?? 0) >= 5, {
    message: 'Give a reason for the suspension',
    path: ['reason'],
  });

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const parsedId = uuidSchema.safeParse(id);
  if (!parsedId.success) {
    return NextResponse.json(new AppError('VALIDATION_FAILED').toResponseBody(), { status: 400 });
  }

  const gate = await requireAdmin(['admin']);
  if (!gate.ok) {
    return NextResponse.json(gate.error.toResponseBody(), { status: gate.error.status });
  }
  const admin = gate.context;

  if (parsedId.data === admin.userId) {
    return NextResponse.json(
      {
        ...new AppError('NOT_AUTHORIZED').toResponseBody(),
        message: 'You cannot suspend your own account.',
      },
      { status: 400 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(new AppError('VALIDATION_FAILED').toResponseBody(), { status: 400 });
  }

  const parsed = suspendSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ...new AppError('VALIDATION_FAILED').toResponseBody(), fields: fieldErrors(parsed.error) },
      { status: 400 },
    );
  }

  const { action, reason } = parsed.data;
  const suspending = action === 'suspend';

  try {
    const { data: before, error: readError } = await admin.service
      .from('profiles')
      .select('id, full_name, role, is_suspended, suspended_reason')
      .eq('id', parsedId.data)
      .maybeSingle();

    if (readError) throw new Error(readError.message);
    if (!before) {
      return NextResponse.json(
        { ...new AppError('NOT_AUTHORIZED').toResponseBody(), message: 'No such account.' },
        { status: 404 },
      );
    }

    const previous = before as {
      id: string;
      full_name: string | null;
      role: string;
      is_suspended: boolean;
      suspended_reason: string | null;
    };

    if (previous.role === 'admin' && suspending) {
      return NextResponse.json(
        {
          ...new AppError('NOT_AUTHORIZED').toResponseBody(),
          message: 'Remove the admin role before suspending an administrator.',
        },
        { status: 400 },
      );
    }

    const { error: updateError } = await admin.service
      .from('profiles')
      .update({
        is_suspended: suspending,
        suspended_reason: suspending ? (reason ?? null) : null,
        suspended_at: suspending ? new Date().toISOString() : null,
      })
      .eq('id', parsedId.data);

    if (updateError) throw new Error(updateError.message);

    await writeAuditLog(
      admin,
      {
        action: suspending ? 'user.suspend' : 'user.unsuspend',
        entityType: 'profile',
        entityId: parsedId.data,
        before: {
          is_suspended: previous.is_suspended,
          suspended_reason: previous.suspended_reason,
        },
        after: { is_suspended: suspending, suspended_reason: suspending ? (reason ?? null) : null },
      },
      request,
    );

    await notifyUser(admin, {
      userId: parsedId.data,
      templateKey: suspending ? 'account_suspended' : 'account_reinstated',
      title: suspending ? 'Your account has been put on hold' : 'Your account has been reinstated',
      body: suspending
        ? (reason ?? 'Your account is on hold. Contact support if you think this is a mistake.')
        : 'The hold on your account has been lifted. You can book and host again.',
      actionUrl: '/help',
      data: { decision: action },
    });

    return NextResponse.json({ ok: true, id: parsedId.data, is_suspended: suspending });
  } catch (error) {
    console.error('[admin/suspend] failed', error instanceof Error ? error.message : error);
    return NextResponse.json(new AppError('UNKNOWN').toResponseBody(), { status: 500 });
  }
}
