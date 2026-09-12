import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { notifyUser, requireAdmin, writeAuditLog } from '@/lib/admin';
import { fieldErrors, uuidSchema } from '@/lib/validation';
import { AppError } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Approve or reject a listing.
 *
 * Rejection requires a reason, and the reason is sent to the host rather than
 * only recorded. A host whose listing is rejected without being told why has no
 * way to fix it, will assume the decision was arbitrary, and will not try again.
 *
 * The write goes through the service client because the guard trigger on
 * parking_spaces refuses a status change into 'active' or 'rejected' from
 * anyone the database does not recognise as an admin.
 */

const moderateSchema = z
  .object({
    action: z.enum(['approve', 'reject']),
    reason: z.string().trim().max(1000).optional(),
  })
  .refine((value) => value.action !== 'reject' || (value.reason?.length ?? 0) >= 10, {
    message: 'Give the host at least a sentence explaining what to change',
    path: ['reason'],
  });

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const parsedId = uuidSchema.safeParse(id);
  if (!parsedId.success) {
    return NextResponse.json(new AppError('SPACE_NOT_FOUND').toResponseBody(), { status: 404 });
  }

  // Moderation is a full admin action. Support reads the queue but does not
  // decide what goes live.
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

  const parsed = moderateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ...new AppError('VALIDATION_FAILED').toResponseBody(), fields: fieldErrors(parsed.error) },
      { status: 400 },
    );
  }

  const { action, reason } = parsed.data;

  try {
    const { data: before, error: readError } = await admin.service
      .from('parking_spaces')
      .select('id, host_id, title, status, rejection_reason')
      .eq('id', parsedId.data)
      .maybeSingle();

    if (readError) throw new Error(readError.message);
    if (!before) {
      return NextResponse.json(new AppError('SPACE_NOT_FOUND').toResponseBody(), { status: 404 });
    }

    const previous = before as {
      id: string;
      host_id: string;
      title: string;
      status: string;
      rejection_reason: string | null;
    };

    const nextStatus = action === 'approve' ? 'active' : 'rejected';

    const { data: after, error: updateError } = await admin.service
      .from('parking_spaces')
      .update({
        status: nextStatus,
        rejection_reason: action === 'reject' ? (reason ?? null) : null,
        reviewed_by: admin.userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', parsedId.data)
      .select('id, status, rejection_reason, reviewed_at, published_at')
      .maybeSingle();

    if (updateError) throw new Error(updateError.message);

    await writeAuditLog(
      admin,
      {
        action: action === 'approve' ? 'listing.approve' : 'listing.reject',
        entityType: 'parking_space',
        entityId: parsedId.data,
        before: { status: previous.status, rejection_reason: previous.rejection_reason },
        after: {
          status: nextStatus,
          rejection_reason: action === 'reject' ? (reason ?? null) : null,
          reviewed_by: admin.userId,
        },
      },
      request,
    );

    await notifyUser(admin, {
      userId: previous.host_id,
      templateKey: action === 'approve' ? 'listing_approved' : 'listing_rejected',
      title:
        action === 'approve'
          ? `${previous.title} is live`
          : `${previous.title} needs changes before it can go live`,
      body:
        action === 'approve'
          ? 'Your listing passed review and is now bookable. It will start appearing in search straight away.'
          : (reason ??
            'Our moderation team asked for changes. Open the listing to edit it and submit it again.'),
      actionUrl: '/host/spaces',
      data: { space_id: parsedId.data, decision: action },
    });

    return NextResponse.json({ ok: true, id: parsedId.data, status: nextStatus, space: after });
  } catch (error) {
    console.error(
      '[admin/moderate] failed',
      error instanceof Error ? error.message : error,
    );
    return NextResponse.json(new AppError('UNKNOWN').toResponseBody(), { status: 500 });
  }
}
