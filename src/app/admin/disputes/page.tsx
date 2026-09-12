import Link from 'next/link';
import { Alert, Badge, Card, EmptyState } from '@/components/ui';
import { requireAdmin } from '@/lib/admin';
import {
  DISPUTE_PRIORITY_LABELS,
  DISPUTE_STATUS_LABELS,
  DISPUTE_STATUS_TONES,
  formatDateTime,
  labelFor,
  one,
  toneFor,
} from '@/lib/dashboard';
import { DisputeActions } from './dispute-actions';

export const dynamic = 'force-dynamic';

interface DisputeRow {
  id: string;
  booking_id: string;
  raised_by: string;
  against_id: string | null;
  category: string;
  description: string;
  evidence_paths: string[];
  status: string;
  priority: number;
  assigned_to: string | null;
  resolution_note: string | null;
  resolved_at: string | null;
  created_at: string;
  bookings: { code: string; starts_at: string } | { code: string; starts_at: string }[] | null;
}

const STATUS_FILTERS = [
  { value: 'open_all', label: 'Everything open' },
  { value: 'all', label: 'Any status' },
  ...Object.entries(DISPUTE_STATUS_LABELS).map(([value, label]) => ({ value, label })),
];

const OPEN_STATUSES = ['open', 'investigating', 'awaiting_user'];

/**
 * The dispute queue.
 *
 * Ordered by priority and then by age, because a P0 safety case raised an hour
 * ago outranks a P2 money case raised last week, and because the oldest case at
 * a given priority is the one most at risk of being forgotten.
 */
export default async function AdminDisputesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const params = await searchParams;
  const statusFilter = params.status ?? 'open_all';

  let disputes: DisputeRow[] = [];
  let names = new Map<string, string>();
  let currentUserId: string | null = null;
  let loadError: string | null = null;

  try {
    const gate = await requireAdmin(['admin', 'support']);
    if (!gate.ok) throw new Error('Not authorised');
    currentUserId = gate.context.userId;

    const service = gate.context.service;

    let request = service
      .from('disputes')
      .select(
        'id, booking_id, raised_by, against_id, category, description, evidence_paths, status, priority, assigned_to, resolution_note, resolved_at, created_at, bookings(code, starts_at)',
      )
      .order('priority', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(100);

    if (statusFilter === 'open_all') request = request.in('status', OPEN_STATUSES);
    else if (statusFilter !== 'all') request = request.eq('status', statusFilter);

    const { data, error } = await request;
    if (error) throw new Error(error.message);

    disputes = (data as unknown as DisputeRow[] | null) ?? [];

    const personIds = Array.from(
      new Set(
        disputes
          .flatMap((dispute) => [dispute.raised_by, dispute.against_id, dispute.assigned_to])
          .filter((value): value is string => Boolean(value)),
      ),
    );
    if (personIds.length > 0) {
      const { data: profiles } = await service
        .from('profiles')
        .select('id, full_name')
        .in('id', personIds);
      for (const row of (profiles as Array<{ id: string; full_name: string | null }> | null) ?? []) {
        names.set(row.id, row.full_name ?? 'Unnamed');
      }
    }
  } catch {
    loadError =
      'We could not load disputes. Check that SUPABASE_SERVICE_ROLE_KEY is set and that the migrations have been applied.';
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Disputes</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Highest priority first, then oldest. P0 is a safety case and comes before everything.
        </p>
      </header>

      <Card className="p-4">
        <form className="flex flex-wrap items-end gap-3" method="get">
          <div className="min-w-48">
            <label className="ps-label" htmlFor="status">
              Show
            </label>
            <select id="status" name="status" className="ps-input" defaultValue={statusFilter}>
              {STATUS_FILTERS.map((filter) => (
                <option key={filter.value} value={filter.value}>
                  {filter.label}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="ps-btn ps-btn-primary">
            Filter
          </button>
        </form>
      </Card>

      {loadError && (
        <Alert tone="warning" title="Disputes unavailable">
          <p className="mt-1">{loadError}</p>
        </Alert>
      )}

      {!loadError && disputes.length === 0 && (
        <EmptyState
          title="Nothing in this view"
          description="No dispute matches the filter. Switch to any status to see resolved cases too."
        />
      )}

      <ul className="space-y-4">
        {disputes.map((dispute) => {
          const booking = one(dispute.bookings);
          const resolved = !OPEN_STATUSES.includes(dispute.status);

          return (
            <Card key={dispute.id} as="li" className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold capitalize">
                      {dispute.category.replace(/_/g, ' ')}
                    </h2>
                    <Badge tone={toneFor(DISPUTE_STATUS_TONES, dispute.status)}>
                      {labelFor(DISPUTE_STATUS_LABELS, dispute.status)}
                    </Badge>
                    <Badge tone={dispute.priority === 0 ? 'danger' : 'neutral'}>
                      {DISPUTE_PRIORITY_LABELS[dispute.priority] ?? `P${dispute.priority}`}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">
                    Raised {formatDateTime(dispute.created_at)} by{' '}
                    {names.get(dispute.raised_by) ?? 'Unknown'}
                    {dispute.against_id && <> against {names.get(dispute.against_id) ?? 'Unknown'}</>}
                  </p>
                </div>

                <div className="shrink-0 text-right text-sm">
                  <Link
                    href={`/bookings/${dispute.booking_id}`}
                    className="font-mono text-xs text-[var(--accent-text)] hover:underline"
                  >
                    {booking?.code ?? dispute.booking_id.slice(0, 8)}
                  </Link>
                  {booking?.starts_at && (
                    <span className="block text-xs text-[var(--text-muted)]">
                      Stay {formatDateTime(booking.starts_at)}
                    </span>
                  )}
                  <span className="mt-1 block text-xs text-[var(--text-muted)]">
                    {dispute.assigned_to
                      ? `Assigned to ${names.get(dispute.assigned_to) ?? 'someone'}`
                      : 'Unassigned'}
                  </span>
                </div>
              </div>

              <p className="mt-4 whitespace-pre-line text-sm leading-relaxed">
                {dispute.description}
              </p>

              {dispute.evidence_paths.length > 0 && (
                <p className="mt-2 text-xs text-[var(--text-muted)]">
                  {dispute.evidence_paths.length}{' '}
                  {dispute.evidence_paths.length === 1 ? 'file' : 'files'} of evidence attached.
                  Evidence lives in a private bucket and is not shown in this build.
                </p>
              )}

              {dispute.resolution_note && (
                <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface-sunken)] p-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
                    Resolution {dispute.resolved_at && `· ${formatDateTime(dispute.resolved_at)}`}
                  </p>
                  <p className="mt-1 whitespace-pre-line text-sm">{dispute.resolution_note}</p>
                </div>
              )}

              <div className="mt-4 border-t pt-4">
                <DisputeActions
                  disputeId={dispute.id}
                  assignedToMe={Boolean(currentUserId) && dispute.assigned_to === currentUserId}
                  isResolved={resolved}
                />
              </div>
            </Card>
          );
        })}
      </ul>
    </div>
  );
}
