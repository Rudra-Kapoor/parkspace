import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { notifyUser, requireAdmin, writeAuditLog } from '@/lib/admin';
import { fieldErrors, uuidSchema } from '@/lib/validation';
import { AppError } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Work a dispute.
 *
 * Support holds this endpoint as well as admin, because dispute handling is the
 * whole of the support role. What support cannot do is anywhere else in this
 * panel: change settings, change roles, or move money directly.
 *
 * Resolving requires a note. The note is what the two parties are shown, and a
 * resolution nobody can read is indistinguishable from being ignored.
 */

const RESOLVED_STATUSES = [
  'resolved_driver',
  'resolved_host',
  'resolved_split',
  'rejected',
] as const;

const patchSchema = z
  .object({
    status: z
      .enum([
        'open',
        'investigating',
        'awaiting_user',
        'resolved_driver',
        'resolved_host',
        'resolved_split',
        'rejected',
        'withdrawn',
      ])
      .optional(),
    /** Take the case. The caller can only ever assign it to themselves. */
    assign_to_self: z.boolean().optional(),
    unassign: z.boolean().optional(),
    resolution_note: z.string().trim().max(4000).optional(),
    priority: z.coerce.number().int().min(0).max(3).optional(),
  })
  .refine(
    (value) =>
      !value.status ||
      !RESOLVED_STATUSES.includes(value.status as (typeof RESOLVED_STATUSES)[number]) ||
      (value.resolution_note?.length ?? 0) >= 10,
    {
      message: 'Write a resolution note. Both parties are shown it.',
      path: ['resolution_note'],
    },
  );

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const parsedId = uuidSchema.safeParse(id);
  if (!parsedId.success) {
    return NextResponse.json(new AppError('VALIDATION_FAILED').toResponseBody(), { status: 400 });
  }

  const gate = await requireAdmin(['admin', 'support']);
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

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ...new AppError('VALIDATION_FAILED').toResponseBody(), fields: fieldErrors(parsed.error) },
      { status: 400 },
    );
  }

  const input = parsed.data;

  try {
    const { data: before, error: readError } = await admin.service
      .from('disputes')
      .select('id, booking_id, raised_by, against_id, status, assigned_to, priority, resolution_note')
      .eq('id', parsedId.data)
      .maybeSingle();

    if (readError) throw new Error(readError.message);
    if (!before) {
      return NextResponse.json(
        { ...new AppError('NOT_AUTHORIZED').toResponseBody(), message: 'No such dispute.' },
        { status: 404 },
      );
    }

    const previous = before as {
      booking_id: string;
      raised_by: string;
      against_id: string | null;
      status: string;
      assigned_to: string | null;
      priority: number;
      resolution_note: string | null;
    };

    const update: Record<string, unknown> = {};
    if (input.assign_to_self) update.assigned_to = admin.userId;
    if (input.unassign) update.assigned_to = null;
    if (input.priority !== undefined) update.priority = input.priority;
    if (input.resolution_note !== undefined) {
      update.resolution_note = input.resolution_note || null;
    }
    if (input.status) {
      update.status = input.status;
      if (RESOLVED_STATUSES.includes(input.status as (typeof RESOLVED_STATUSES)[number])) {
        update.resolved_at = new Date().toISOString();
      }
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json(new AppError('VALIDATION_FAILED').toResponseBody(), { status: 400 });
    }

    const { data: after, error: updateError } = await admin.service
      .from('disputes')
      .update(update)
      .eq('id', parsedId.data)
      .select('id, status, assigned_to, priority, resolution_note, resolved_at')
      .maybeSingle();

    if (updateError) throw new Error(updateError.message);

    await writeAuditLog(
      admin,
      {
        action: 'dispute.update',
        entityType: 'dispute',
        entityId: parsedId.data,
        before: {
          status: previous.status,
          assigned_to: previous.assigned_to,
          priority: previous.priority,
          resolution_note: previous.resolution_note,
        },
        after: update,
      },
      request,
    );

    if (
      input.status &&
      RESOLVED_STATUSES.includes(input.status as (typeof RESOLVED_STATUSES)[number])
    ) {
      const recipients = [previous.raised_by, previous.against_id].filter(
        (value): value is string => Boolean(value),
      );
      for (const recipient of recipients) {
        await notifyUser(admin, {
          userId: recipient,
          templateKey: 'dispute_resolved',
          title: 'Your dispute has been decided',
          body:
            input.resolution_note ??
            'A decision has been recorded on your dispute. Open the booking to see it.',
          actionUrl: `/bookings/${previous.booking_id}`,
          data: { dispute_id: parsedId.data, outcome: input.status },
        });
      }
    }

    return NextResponse.json({ ok: true, dispute: after });
  } catch (error) {
    console.error('[admin/disputes] failed', error instanceof Error ? error.message : error);
    return NextResponse.json(new AppError('UNKNOWN').toResponseBody(), { status: 500 });
  }
}
