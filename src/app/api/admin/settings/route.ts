import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAdmin, writeAuditLog } from '@/lib/admin';
import { fieldErrors } from '@/lib/validation';
import { AppError } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Platform settings: the business rule engine.
 *
 * These values decide what every future booking costs, how long a hold lasts
 * and how much grace an overstay gets. Changing one is a business decision with
 * financial consequences, so three things are non-negotiable here:
 *
 *  1. Full admin only. Support does not set commission.
 *  2. Every change writes an audit row with the before and after value.
 *  3. A value is parsed as JSON and stored as JSON. The column is jsonb and the
 *     database accessors cast it, so writing a bare string where a number is
 *     expected would silently break pricing on the next quote.
 */

const patchSchema = z.object({
  changes: z
    .array(
      z.object({
        key: z.string().trim().min(1).max(80),
        /** The raw text from the form. Parsed as JSON below. */
        value: z.string().trim().min(1).max(2000),
      }),
    )
    .min(1, 'Nothing to change')
    .max(50),
});

/**
 * Accept both `0.12` and `"0.12"` from the form, but store the JSON the column
 * is meant to hold. A bare word that is not valid JSON becomes a JSON string,
 * which is right for the few settings that really are text.
 */
function parseSettingValue(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export async function PATCH(request: NextRequest) {
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

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ...new AppError('VALIDATION_FAILED').toResponseBody(), fields: fieldErrors(parsed.error) },
      { status: 400 },
    );
  }

  const keys = parsed.data.changes.map((change) => change.key);

  try {
    const { data: existingRows, error: readError } = await admin.service
      .from('platform_settings')
      .select('key, value, description')
      .in('key', keys);

    if (readError) throw new Error(readError.message);

    const existing = new Map<string, unknown>();
    for (const row of (existingRows as Array<{ key: string; value: unknown }> | null) ?? []) {
      existing.set(row.key, row.value);
    }

    const applied: Array<{ key: string; before: unknown; after: unknown }> = [];
    const rejected: Record<string, string> = {};

    for (const change of parsed.data.changes) {
      if (!existing.has(change.key)) {
        // Settings are seeded by migration. Inventing new keys from a form
        // would produce configuration nothing reads.
        rejected[change.key] = 'There is no setting with that key';
        continue;
      }

      const before = existing.get(change.key);
      const after = parseSettingValue(change.value);

      if (JSON.stringify(before) === JSON.stringify(after)) continue;

      const { error: updateError } = await admin.service
        .from('platform_settings')
        .update({ value: after, updated_by: admin.userId })
        .eq('key', change.key);

      if (updateError) {
        rejected[change.key] = 'That value was not accepted by the database';
        continue;
      }

      applied.push({ key: change.key, before, after });

      await writeAuditLog(
        admin,
        {
          action: 'settings.update',
          entityType: 'platform_setting',
          entityId: change.key,
          before: { key: change.key, value: before },
          after: { key: change.key, value: after },
        },
        request,
      );
    }

    return NextResponse.json({
      ok: Object.keys(rejected).length === 0,
      applied,
      fields: Object.keys(rejected).length > 0 ? rejected : undefined,
      message:
        Object.keys(rejected).length > 0
          ? 'Some settings were not saved. The ones that were are listed in applied.'
          : undefined,
    });
  } catch (error) {
    console.error('[admin/settings] failed', error instanceof Error ? error.message : error);
    return NextResponse.json(new AppError('UNKNOWN').toResponseBody(), { status: 500 });
  }
}

export async function GET() {
  const gate = await requireAdmin(['admin', 'support']);
  if (!gate.ok) {
    return NextResponse.json(gate.error.toResponseBody(), { status: gate.error.status });
  }

  const { data, error } = await gate.context.service
    .from('platform_settings')
    .select('key, value, description, updated_at, updated_by')
    .order('key');

  if (error) {
    return NextResponse.json(new AppError('UNKNOWN').toResponseBody(), { status: 500 });
  }

  return NextResponse.json({ ok: true, settings: data ?? [] });
}
