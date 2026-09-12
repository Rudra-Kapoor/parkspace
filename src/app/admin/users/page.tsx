import { Alert, Badge, Card, EmptyState } from '@/components/ui';
import { TableShell, THead, Th, Td, Tr } from '@/components/table';
import { formatPaise } from '@/lib/money';
import { adminServiceClient } from '@/lib/admin';
import {
  formatDate,
  labelFor,
  toneFor,
  VERIFICATION_STATUS_LABELS,
  VERIFICATION_STATUS_TONES,
} from '@/lib/dashboard';
import { SuspendActions } from './suspend-actions';

export const dynamic = 'force-dynamic';

interface UserRow {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  role: string;
  roles: string[];
  verification: string;
  trust_score: number;
  bookings_completed: number;
  bookings_cancelled: number;
  wallet_balance_paise: number;
  is_suspended: boolean;
  suspended_reason: string | null;
  created_at: string;
}

const ROLE_FILTERS = ['all', 'driver', 'host', 'operator', 'support', 'admin'] as const;

/**
 * The user list.
 *
 * Search is a server round trip on a submitted form rather than a live filter.
 * The table can hold every account on the platform, so filtering in the browser
 * would mean shipping the whole user table to the browser, which is exactly the
 * thing this panel exists to avoid doing casually.
 */
export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; role?: string; state?: string }>;
}) {
  const params = await searchParams;
  const query = (params.q ?? '').trim();
  const role = params.role && ROLE_FILTERS.includes(params.role as (typeof ROLE_FILTERS)[number])
    ? params.role
    : 'all';
  const state = params.state === 'suspended' ? 'suspended' : 'all';

  let users: UserRow[] = [];
  let loadError: string | null = null;
  let truncated = false;

  try {
    const service = await adminServiceClient();
    if (!service) throw new Error('Not authorised');

    let request = service
      .from('profiles')
      .select(
        'id, full_name, email, phone, role, roles, verification, trust_score, bookings_completed, bookings_cancelled, wallet_balance_paise, is_suspended, suspended_reason, created_at',
      )
      .order('created_at', { ascending: false })
      .limit(100);

    if (query) {
      // PostgREST `or` with ilike. The commas inside the filter are part of the
      // expression, which is why the value is interpolated rather than passed
      // as a parameter: there is no parameter form for this operator.
      const safe = query.replace(/[(),*]/g, ' ').trim();
      if (safe) {
        request = request.or(
          `full_name.ilike.%${safe}%,email.ilike.%${safe}%,phone.ilike.%${safe}%`,
        );
      }
    }
    if (role !== 'all') request = request.eq('role', role);
    if (state === 'suspended') request = request.eq('is_suspended', true);

    const { data, error } = await request;
    if (error) throw new Error(error.message);

    users = (data as UserRow[] | null) ?? [];
    truncated = users.length === 100;
  } catch {
    loadError =
      'We could not load the user list. Check that SUPABASE_SERVICE_ROLE_KEY is set and that the migrations have been applied.';
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Users</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Accounts, their standing, and the suspension lever.
        </p>
      </header>

      <Card className="p-4">
        <form className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto]" method="get">
          <div>
            <label className="ps-label" htmlFor="q">
              Search
            </label>
            <input
              id="q"
              name="q"
              className="ps-input"
              defaultValue={query}
              placeholder="Name, email or phone"
            />
          </div>
          <div>
            <label className="ps-label" htmlFor="role">
              Role
            </label>
            <select id="role" name="role" className="ps-input" defaultValue={role}>
              {ROLE_FILTERS.map((value) => (
                <option key={value} value={value}>
                  {value === 'all' ? 'Any role' : value}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="ps-label" htmlFor="state">
              State
            </label>
            <select id="state" name="state" className="ps-input" defaultValue={state}>
              <option value="all">Any state</option>
              <option value="suspended">Suspended only</option>
            </select>
          </div>
          <div className="flex items-end">
            <button type="submit" className="ps-btn ps-btn-primary w-full">
              Search
            </button>
          </div>
        </form>
      </Card>

      {loadError && (
        <Alert tone="warning" title="List unavailable">
          <p className="mt-1">{loadError}</p>
        </Alert>
      )}

      {!loadError && users.length === 0 && (
        <EmptyState
          title="No accounts match"
          description="Try a shorter search, or clear the filters. Search matches on name, email and phone."
        />
      )}

      {users.length > 0 && (
        <Card className="overflow-hidden">
          <TableShell caption="Accounts with their role, standing and booking history" minWidth="58rem">
            <THead>
              <Th>Account</Th>
              <Th>Role</Th>
              <Th>Verification</Th>
              <Th align="right">Trust</Th>
              <Th align="right">Completed</Th>
              <Th align="right">Cancelled</Th>
              <Th align="right">Wallet</Th>
              <Th>State</Th>
              <Th>Action</Th>
            </THead>
            <tbody>
              {users.map((user) => (
                <Tr key={user.id}>
                  <Td>
                    <span className="font-semibold">{user.full_name ?? 'No name given'}</span>
                    <span className="block text-xs text-[var(--text-muted)]">
                      {user.email ?? 'No email'}
                    </span>
                    {user.phone && (
                      <span className="block text-xs text-[var(--text-muted)]">{user.phone}</span>
                    )}
                    <span className="block text-xs text-[var(--text-muted)]">
                      Joined {formatDate(user.created_at)}
                    </span>
                  </Td>
                  <Td>
                    <span className="font-medium capitalize">{user.role}</span>
                    {Array.isArray(user.roles) && user.roles.length > 1 && (
                      <span className="block text-xs text-[var(--text-muted)]">
                        also {user.roles.filter((r) => r !== user.role).join(', ')}
                      </span>
                    )}
                  </Td>
                  <Td>
                    <Badge tone={toneFor(VERIFICATION_STATUS_TONES, user.verification)}>
                      {labelFor(VERIFICATION_STATUS_LABELS, user.verification)}
                    </Badge>
                  </Td>
                  <Td align="right">{user.trust_score}</Td>
                  <Td align="right">{user.bookings_completed}</Td>
                  <Td align="right">{user.bookings_cancelled}</Td>
                  <Td align="right">
                    {formatPaise(Math.round(Number(user.wallet_balance_paise) || 0))}
                  </Td>
                  <Td>
                    {user.is_suspended ? (
                      <>
                        <Badge tone="danger">Suspended</Badge>
                        {user.suspended_reason && (
                          <span className="mt-1 block max-w-48 text-xs text-[var(--text-muted)]">
                            {user.suspended_reason}
                          </span>
                        )}
                      </>
                    ) : (
                      <Badge tone="success">Active</Badge>
                    )}
                  </Td>
                  <Td>
                    <SuspendActions
                      userId={user.id}
                      name={user.full_name ?? 'this account'}
                      isSuspended={user.is_suspended}
                    />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableShell>
        </Card>
      )}

      {truncated && (
        <p className="text-sm text-[var(--text-muted)]">
          Showing the first 100 matches. Narrow the search to see the rest.
        </p>
      )}
    </div>
  );
}
