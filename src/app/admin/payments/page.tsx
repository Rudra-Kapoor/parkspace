import Link from 'next/link';
import { Alert, Badge, Card, EmptyState, Stat } from '@/components/ui';
import { TableShell, THead, Th, Td, Tr } from '@/components/table';
import { formatPaise } from '@/lib/money';
import { adminServiceClient } from '@/lib/admin';
import {
  formatDateTime,
  istMonthStart,
  labelFor,
  one,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_TONES,
  toneFor,
} from '@/lib/dashboard';

export const dynamic = 'force-dynamic';

interface PaymentRow {
  id: string;
  booking_id: string;
  payer_id: string;
  provider: string;
  provider_payment_id: string | null;
  method: string | null;
  amount_paise: number;
  status: string;
  failure_reason: string | null;
  captured_at: string | null;
  created_at: string;
  bookings: { code: string } | { code: string }[] | null;
}

interface RefundRow {
  id: string;
  booking_id: string;
  amount_paise: number;
  status: string;
  reason: string;
  policy_applied: string | null;
  to_wallet: boolean;
  created_at: string;
  completed_at: string | null;
}

const STATUS_FILTERS = [
  'all',
  'created',
  'authorized',
  'captured',
  'failed',
  'refunded',
  'partially_refunded',
] as const;

/**
 * Payments and refunds, read only.
 *
 * The money on this page was moved by the payment provider and recorded by the
 * webhook. Editing a row here would make the ledger disagree with the provider,
 * which is the one state from which reconciliation cannot recover, so nothing
 * on this page writes.
 */
export default async function AdminPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; provider?: string }>;
}) {
  const params = await searchParams;
  const status =
    params.status && STATUS_FILTERS.includes(params.status as (typeof STATUS_FILTERS)[number])
      ? params.status
      : 'all';
  const provider = (params.provider ?? '').trim();

  let payments: PaymentRow[] = [];
  let refunds: RefundRow[] = [];
  let capturedThisMonthPaise = 0;
  let refundedThisMonthPaise = 0;
  let failedThisMonth = 0;
  let loadError: string | null = null;

  try {
    const service = await adminServiceClient();
    if (!service) throw new Error('Not authorised');

    const monthStart = istMonthStart(0).toISOString();

    let request = service
      .from('payments')
      .select(
        'id, booking_id, payer_id, provider, provider_payment_id, method, amount_paise, status, failure_reason, captured_at, created_at, bookings(code)',
      )
      .order('created_at', { ascending: false })
      .limit(100);

    if (status !== 'all') request = request.eq('status', status);
    if (provider) request = request.eq('provider', provider);

    const [paymentsResult, refundsResult, monthPayments] = await Promise.all([
      request,
      service
        .from('refunds')
        .select(
          'id, booking_id, amount_paise, status, reason, policy_applied, to_wallet, created_at, completed_at',
        )
        .order('created_at', { ascending: false })
        .limit(50),
      service
        .from('payments')
        .select('amount_paise, status')
        .gte('created_at', monthStart)
        .limit(5000),
    ]);

    if (paymentsResult.error) throw new Error(paymentsResult.error.message);

    payments = (paymentsResult.data as unknown as PaymentRow[] | null) ?? [];
    refunds = (refundsResult.data as RefundRow[] | null) ?? [];

    for (const row of (monthPayments.data as Array<{ amount_paise: number; status: string }> | null) ??
      []) {
      if (row.status === 'captured') {
        capturedThisMonthPaise += Math.round(Number(row.amount_paise) || 0);
      }
      if (row.status === 'refunded' || row.status === 'partially_refunded') {
        refundedThisMonthPaise += Math.round(Number(row.amount_paise) || 0);
      }
      if (row.status === 'failed') failedThisMonth += 1;
    }
  } catch {
    loadError =
      'We could not load payments. Check that SUPABASE_SERVICE_ROLE_KEY is set and that the migrations have been applied.';
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Payments</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Read only. What the provider reported, as it reported it.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="Captured this month"
          value={formatPaise(capturedThisMonthPaise)}
          hint="Successful charges"
          tone="accent"
        />
        <Stat
          label="Refunded this month"
          value={formatPaise(refundedThisMonthPaise)}
          hint="Full and partial"
        />
        <Stat label="Failed this month" value={failedThisMonth} hint="Declined or abandoned" />
      </div>

      <Alert tone="info" title="This build does not move real money">
        <p className="mt-1">
          The default payment provider is a mock adapter that simulates the whole authorise, capture
          and webhook cycle without touching a gateway. Swapping in the Razorpay adapter is a
          configuration change, not a code change.
        </p>
      </Alert>

      <Card className="p-4">
        <form className="grid gap-3 sm:grid-cols-[auto_auto_auto]" method="get">
          <div>
            <label className="ps-label" htmlFor="status">
              Status
            </label>
            <select id="status" name="status" className="ps-input" defaultValue={status}>
              {STATUS_FILTERS.map((value) => (
                <option key={value} value={value}>
                  {value === 'all' ? 'Any status' : labelFor(PAYMENT_STATUS_LABELS, value)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="ps-label" htmlFor="provider">
              Provider
            </label>
            <input
              id="provider"
              name="provider"
              className="ps-input"
              defaultValue={provider}
              placeholder="mock or razorpay"
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
        <Alert tone="warning" title="Payments unavailable">
          <p className="mt-1">{loadError}</p>
        </Alert>
      )}

      {!loadError && payments.length === 0 && (
        <EmptyState title="No payments match" description="Clear the filters to see everything." />
      )}

      {payments.length > 0 && (
        <Card className="overflow-hidden">
          <TableShell caption="Payments with their provider, method, amount and status" minWidth="52rem">
            <THead>
              <Th>Created</Th>
              <Th>Booking</Th>
              <Th>Provider</Th>
              <Th>Method</Th>
              <Th>Status</Th>
              <Th align="right">Amount</Th>
            </THead>
            <tbody>
              {payments.map((payment) => (
                <Tr key={payment.id}>
                  <Td>
                    {formatDateTime(payment.created_at)}
                    {payment.captured_at && (
                      <span className="block text-xs text-[var(--text-muted)]">
                        captured {formatDateTime(payment.captured_at)}
                      </span>
                    )}
                  </Td>
                  <Td>
                    <Link
                      href={`/bookings/${payment.booking_id}`}
                      className="font-mono text-xs hover:underline"
                    >
                      {one(payment.bookings)?.code ?? payment.booking_id.slice(0, 8)}
                    </Link>
                  </Td>
                  <Td>
                    {payment.provider}
                    {payment.provider_payment_id && (
                      <span className="block break-all text-xs text-[var(--text-muted)]">
                        {payment.provider_payment_id}
                      </span>
                    )}
                  </Td>
                  <Td>{payment.method ?? 'Not stated'}</Td>
                  <Td>
                    <Badge tone={toneFor(PAYMENT_STATUS_TONES, payment.status)}>
                      {labelFor(PAYMENT_STATUS_LABELS, payment.status)}
                    </Badge>
                    {payment.failure_reason && (
                      <span className="mt-1 block max-w-48 text-xs text-[var(--text-muted)]">
                        {payment.failure_reason}
                      </span>
                    )}
                  </Td>
                  <Td align="right">
                    {formatPaise(Math.round(Number(payment.amount_paise) || 0))}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableShell>
        </Card>
      )}

      {refunds.length > 0 && (
        <section aria-labelledby="refunds-heading">
          <h2 id="refunds-heading" className="text-lg font-semibold">
            Recent refunds
          </h2>
          <Card className="mt-3 overflow-hidden">
            <TableShell caption="Refunds with the policy applied and their status" minWidth="46rem">
              <THead>
                <Th>Raised</Th>
                <Th>Booking</Th>
                <Th>Policy</Th>
                <Th>Reason</Th>
                <Th>Status</Th>
                <Th align="right">Amount</Th>
              </THead>
              <tbody>
                {refunds.map((refund) => (
                  <Tr key={refund.id}>
                    <Td>{formatDateTime(refund.created_at)}</Td>
                    <Td>
                      <Link
                        href={`/bookings/${refund.booking_id}`}
                        className="font-mono text-xs hover:underline"
                      >
                        {refund.booking_id.slice(0, 8)}
                      </Link>
                    </Td>
                    <Td>{refund.policy_applied ?? 'Not stated'}</Td>
                    <Td>
                      <span className="block max-w-56">{refund.reason}</span>
                      {refund.to_wallet && (
                        <span className="block text-xs text-[var(--text-muted)]">
                          Issued as wallet credit
                        </span>
                      )}
                    </Td>
                    <Td>{refund.status}</Td>
                    <Td align="right">
                      {formatPaise(Math.round(Number(refund.amount_paise) || 0))}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </TableShell>
          </Card>
        </section>
      )}
    </div>
  );
}
