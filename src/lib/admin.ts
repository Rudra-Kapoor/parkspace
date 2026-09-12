/**
 * Admin route plumbing.
 *
 * Two things every admin endpoint needs and none of them should reimplement:
 * the authorisation check, and the audit entry.
 *
 * The order matters and is enforced by the shape of `requireAdmin`: it returns
 * the service client only on the success branch, so there is no way to hold a
 * privilege-bypassing client before the caller has been identified as an admin.
 */

import { createClient, createServiceClient, getCurrentProfile } from './supabase/server';
import { AppError } from './errors';

export type AdminTier = 'admin' | 'support';

export interface AdminContext {
  userId: string;
  role: AdminTier;
  fullName: string | null;
  /** Bypasses RLS. Only ever reached after the role check above has passed. */
  service: ReturnType<typeof createServiceClient>;
}

export type AdminGate =
  | { ok: true; context: AdminContext }
  | { ok: false; error: AppError };

/**
 * @param tiers which admin roles may proceed. 'support' is read-mostly: it
 *        handles disputes and reads everything, but does not change money,
 *        settings or roles.
 */
export async function requireAdmin(tiers: AdminTier[] = ['admin', 'support']): Promise<AdminGate> {
  let profile: {
    id: string;
    role: string;
    full_name: string | null;
    is_suspended: boolean;
  } | null = null;

  try {
    profile = await getCurrentProfile();
  } catch {
    return { ok: false, error: new AppError('NOT_CONFIGURED') };
  }

  if (!profile) return { ok: false, error: new AppError('NOT_AUTHENTICATED') };
  if (profile.is_suspended) return { ok: false, error: new AppError('ACCOUNT_SUSPENDED') };
  if (!tiers.includes(profile.role as AdminTier)) {
    return { ok: false, error: new AppError('NOT_AUTHORIZED') };
  }

  let service: ReturnType<typeof createServiceClient>;
  try {
    service = createServiceClient();
  } catch {
    return { ok: false, error: new AppError('NOT_CONFIGURED') };
  }

  return {
    ok: true,
    context: {
      userId: profile.id,
      role: profile.role as AdminTier,
      fullName: profile.full_name,
      service,
    },
  };
}

/**
 * A read-only service client for an admin page.
 *
 * Aggregates across every host and every booking cannot come through the
 * request-scoped client, because RLS correctly scopes that to the caller. This
 * is the narrow, already-authorised exception the service key exists for.
 */
export async function adminServiceClient(
  tiers: AdminTier[] = ['admin', 'support'],
): Promise<ReturnType<typeof createServiceClient> | null> {
  const gate = await requireAdmin(tiers);
  return gate.ok ? gate.context.service : null;
}

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
}

/**
 * Write one audit row.
 *
 * Never throws. An audit write that fails must not roll back the action it was
 * describing, because an unrecorded change is bad and a change that silently
 * did not happen is worse. Failures are logged for the operator instead.
 */
export async function writeAuditLog(
  context: AdminContext,
  entry: AuditEntry,
  request?: Request,
): Promise<void> {
  try {
    const forwarded = request?.headers.get('x-forwarded-for') ?? null;
    const ip = forwarded ? (forwarded.split(',')[0] ?? '').trim() || null : null;

    await context.service.from('audit_logs').insert({
      actor_id: context.userId,
      actor_role: context.role,
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId ?? null,
      before_state: entry.before ?? null,
      after_state: entry.after ?? null,
      ip_address: ip,
      user_agent: request?.headers.get('user-agent') ?? null,
    });
  } catch (error) {
    console.error('[audit] write failed', error instanceof Error ? error.message : error);
  }
}

/** Queue an in-app notification. Also best effort, for the same reason. */
export async function notifyUser(
  context: AdminContext,
  notification: {
    userId: string;
    templateKey: string;
    title: string;
    body: string;
    actionUrl?: string | null;
    data?: Record<string, unknown>;
    dedupeKey?: string | null;
  },
): Promise<void> {
  try {
    await context.service.from('notifications').insert({
      user_id: notification.userId,
      channel: 'in_app',
      template_key: notification.templateKey,
      title: notification.title,
      body: notification.body,
      action_url: notification.actionUrl ?? null,
      data: notification.data ?? {},
      dedupe_key: notification.dedupeKey ?? null,
      sent_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[notify] write failed', error instanceof Error ? error.message : error);
  }
}

/** The request-scoped client, for the rare admin read that RLS already allows. */
export async function adminRequestClient() {
  return createClient();
}
