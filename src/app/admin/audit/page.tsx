import Link from 'next/link';
import { Alert, Card, EmptyState } from '@/components/ui';
import { adminServiceClient } from '@/lib/admin';
import { formatDateTime } from '@/lib/dashboard';

export const dynamic = 'force-dynamic';

interface AuditRow {
  id: number;
  actor_id: string | null;
  actor_role: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  before_state: unknown;
  after_state: unknown;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

const PAGE_SIZE = 50;

/**
 * The audit log.
 *
 * Append only in practice: nothing in the application updates or deletes a row
 * here, and RLS grants no client role anything but select. This page is the
 * answer to "who changed that, and what did it used to be", which is the
 * question every incident eventually reduces to.
 */
export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; action?: string; entity?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1);
  const actionFilter = (params.action ?? '').trim();
  const entityFilter = (params.entity ?? '').trim();

  let rows: AuditRow[] = [];
  let actorNames = new Map<string, string>();
  let total = 0;
  let loadError: string | null = null;

  try {
    const service = await adminServiceClient();
    if (!service) throw new Error('Not authorised');

    const from = (page - 1) * PAGE_SIZE;

    let request = service
      .from('audit_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (actionFilter) request = request.ilike('action', `%${actionFilter.replace(/[%,()]/g, '')}%`);
    if (entityFilter) request = request.eq('entity_type', entityFilter);

    const { data, error, count } = await request;
    if (error) throw new Error(error.message);

    rows = (data as AuditRow[] | null) ?? [];
    total = count ?? rows.length;

    const actorIds = Array.from(
      new Set(rows.map((row) => row.actor_id).filter((value): value is string => Boolean(value))),
    );
    if (actorIds.length > 0) {
      const { data: profiles } = await service
        .from('profiles')
        .select('id, full_name, email')
        .in('id', actorIds);
      for (const profile of (profiles as Array<{
        id: string;
        full_name: string | null;
        email: string | null;
      }> | null) ?? []) {
        actorNames.set(profile.id, profile.full_name ?? profile.email ?? 'Unnamed');
      }
    }
  } catch {
    loadError =
      'We could not load the audit log. Check that SUPABASE_SERVICE_ROLE_KEY is set and that the migrations have been applied.';
  }

  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const pageHref = (target: number) => {
    const query = new URLSearchParams();
    if (actionFilter) query.set('action', actionFilter);
    if (entityFilter) query.set('entity', entityFilter);
    query.set('page', String(target));
    return `/admin/audit?${query.toString()}`;
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Audit log</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Newest first. {total.toLocaleString('en-IN')} recorded{' '}
          {total === 1 ? 'entry' : 'entries'}.
        </p>
      </header>

      <Card className="p-4">
        <form className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]" method="get">
          <div>
            <label className="ps-label" htmlFor="action">
              Action contains
            </label>
            <input
              id="action"
              name="action"
              className="ps-input"
              defaultValue={actionFilter}
              placeholder="listing.approve"
            />
          </div>
          <div>
            <label className="ps-label" htmlFor="entity">
              Entity type
            </label>
            <input
              id="entity"
              name="entity"
              className="ps-input"
              defaultValue={entityFilter}
              placeholder="parking_space"
            />
          </div>
          <div className="flex items-end">
            <button type="submit" className="ps-btn ps-btn-primary w-full">
              Filter
            </button>
          </div>
        </form>
      </Card>

      {loadError && (
        <Alert tone="warning" title="Audit log unavailable">
          <p className="mt-1">{loadError}</p>
        </Alert>
      )}

      {!loadError && rows.length === 0 && (
        <EmptyState
          title="Nothing recorded yet"
          description="Moderation decisions, suspensions, dispute resolutions and settings changes all write here the moment they happen."
        />
      )}

      <ul className="space-y-3">
        {rows.map((row) => (
          <Card key={row.id} as="li" className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-mono text-sm font-bold">{row.action}</p>
                <p className="mt-0.5 text-sm text-[var(--text-muted)]">
                  {row.entity_type}
                  {row.entity_id && (
                    <>
                      {' · '}
                      <span className="font-mono text-xs">{row.entity_id}</span>
                    </>
                  )}
                </p>
              </div>
              <div className="shrink-0 text-right text-sm">
                <p className="font-medium">
                  {row.actor_id ? (actorNames.get(row.actor_id) ?? 'Unknown actor') : 'System'}
                </p>
                <p className="text-xs text-[var(--text-muted)]">
                  {row.actor_role ?? 'no role'} · {formatDateTime(row.created_at)}
                </p>
                {row.ip_address && (
                  <p className="font-mono text-xs text-[var(--text-muted)]">{row.ip_address}</p>
                )}
              </div>
            </div>

            {(row.before_state != null || row.after_state != null) && (
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-semibold text-[var(--accent-text)]">
                  Before and after
                </summary>
                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                  <StateBlock title="Before" value={row.before_state} />
                  <StateBlock title="After" value={row.after_state} />
                </div>
                {row.user_agent && (
                  <p className="mt-3 break-all text-xs text-[var(--text-muted)]">
                    {row.user_agent}
                  </p>
                )}
              </details>
            )}
          </Card>
        ))}
      </ul>

      {total > PAGE_SIZE && (
        <nav className="flex flex-wrap items-center justify-between gap-3" aria-label="Audit log pages">
          {page > 1 ? (
            <Link href={pageHref(page - 1)} className="ps-btn ps-btn-secondary">
              Newer
            </Link>
          ) : (
            <span />
          )}
          <p className="text-sm text-[var(--text-muted)]">
            Page {page} of {lastPage}
          </p>
          {page < lastPage ? (
            <Link href={pageHref(page + 1)} className="ps-btn ps-btn-secondary">
              Older
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}

function StateBlock({ title, value }: { title: string; value: unknown }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">{title}</p>
      <pre className="ps-scroll-x mt-1 rounded-lg border border-[var(--border)] bg-[var(--surface-sunken)] p-3 text-xs">
        {value == null ? 'null' : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}
