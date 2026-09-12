import { Alert, Badge, Card, EmptyState } from '@/components/ui';
import { TableShell, THead, Th, Td, Tr } from '@/components/table';
import { formatPaise } from '@/lib/money';
import { adminServiceClient } from '@/lib/admin';
import { formatDateTime } from '@/lib/dashboard';
import { CouponForm } from './coupon-form';

export const dynamic = 'force-dynamic';

interface CouponRow {
  id: string;
  code: string;
  description: string | null;
  coupon_type: string;
  value: number;
  max_discount_paise: number | null;
  min_booking_paise: number;
  max_redemptions: number | null;
  max_per_user: number;
  redemption_count: number;
  new_users_only: boolean;
  first_booking_only: boolean;
  valid_from: string;
  valid_until: string | null;
  is_active: boolean;
  created_at: string;
}

/**
 * Coupons.
 *
 * The stored `value` is shown in both units on every row: the human one and the
 * one in the column. Anyone auditing a campaign wants the first, anyone
 * debugging a discount that came out wrong wants the second, and showing only
 * one of them guarantees somebody eventually reads it as the other.
 */
export default async function AdminCouponsPage() {
  let coupons: CouponRow[] = [];
  let redemptionTotals = new Map<string, { count: number; discountPaise: number }>();
  let loadError: string | null = null;

  try {
    const service = await adminServiceClient();
    if (!service) throw new Error('Not authorised');

    const { data, error } = await service
      .from('coupons')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) throw new Error(error.message);
    coupons = (data as CouponRow[] | null) ?? [];

    if (coupons.length > 0) {
      const { data: redemptions } = await service
        .from('coupon_redemptions')
        .select('coupon_id, discount_paise')
        .in(
          'coupon_id',
          coupons.map((coupon) => coupon.id),
        )
        .limit(5000);

      for (const row of (redemptions as Array<{
        coupon_id: string;
        discount_paise: number;
      }> | null) ?? []) {
        const entry = redemptionTotals.get(row.coupon_id) ?? { count: 0, discountPaise: 0 };
        entry.count += 1;
        entry.discountPaise += Math.round(Number(row.discount_paise) || 0);
        redemptionTotals.set(row.coupon_id, entry);
      }
    }
  } catch {
    loadError =
      'We could not load coupons. Check that SUPABASE_SERVICE_ROLE_KEY is set and that the migrations have been applied.';
  }

  const now = Date.now();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Coupons</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Discounts are validated server side at quote time, never by trusting a code the browser
          sends.
        </p>
      </header>

      {loadError && (
        <Alert tone="warning" title="Coupons unavailable">
          <p className="mt-1">{loadError}</p>
        </Alert>
      )}

      <Card className="p-5 sm:p-6">
        <h2 className="text-lg font-semibold">Create a coupon</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Enter percentages as percentages and amounts in rupees. The conversion to the stored unit
          happens once, and the form tells you exactly what it will write.
        </p>
        <div className="mt-5">
          <CouponForm />
        </div>
      </Card>

      <section aria-labelledby="list-heading">
        <h2 id="list-heading" className="text-lg font-semibold">
          Existing coupons
        </h2>

        {!loadError && coupons.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              title="No coupons yet"
              description="Create one above. A coupon with a total redemption cap and an expiry is far easier to reason about than an open-ended one."
            />
          </div>
        ) : (
          <Card className="mt-3 overflow-hidden">
            <TableShell caption="Coupons with their value, limits and redemption counts" minWidth="58rem">
              <THead>
                <Th>Code</Th>
                <Th>Discount</Th>
                <Th>Stored value</Th>
                <Th>Conditions</Th>
                <Th>Window</Th>
                <Th align="right">Redeemed</Th>
                <Th align="right">Given away</Th>
                <Th>State</Th>
              </THead>
              <tbody>
                {coupons.map((coupon) => {
                  const totals = redemptionTotals.get(coupon.id);
                  const expired =
                    coupon.valid_until != null && new Date(coupon.valid_until).getTime() < now;
                  const exhausted =
                    coupon.max_redemptions != null &&
                    coupon.redemption_count >= coupon.max_redemptions;

                  return (
                    <Tr key={coupon.id}>
                      <Td>
                        <span className="font-mono font-bold">{coupon.code}</span>
                        {coupon.description && (
                          <span className="block max-w-48 text-xs text-[var(--text-muted)]">
                            {coupon.description}
                          </span>
                        )}
                      </Td>
                      <Td>
                        {coupon.coupon_type === 'percent'
                          ? `${(coupon.value / 100).toFixed(coupon.value % 100 === 0 ? 0 : 2)}% off`
                          : `${formatPaise(Math.round(Number(coupon.value)))} off`}
                        {coupon.max_discount_paise != null && (
                          <span className="block text-xs text-[var(--text-muted)]">
                            capped at {formatPaise(Math.round(Number(coupon.max_discount_paise)))}
                          </span>
                        )}
                      </Td>
                      <Td>
                        <span className="font-mono text-xs">
                          {coupon.value}{' '}
                          {coupon.coupon_type === 'percent' ? 'basis points' : 'paise'}
                        </span>
                      </Td>
                      <Td>
                        <span className="block text-xs text-[var(--text-muted)]">
                          {coupon.min_booking_paise > 0
                            ? `Min ${formatPaise(Math.round(Number(coupon.min_booking_paise)))}`
                            : 'No minimum'}
                        </span>
                        <span className="block text-xs text-[var(--text-muted)]">
                          {coupon.max_per_user} per user
                        </span>
                        {coupon.new_users_only && (
                          <span className="block text-xs text-[var(--text-muted)]">
                            New accounts only
                          </span>
                        )}
                        {coupon.first_booking_only && (
                          <span className="block text-xs text-[var(--text-muted)]">
                            First booking only
                          </span>
                        )}
                      </Td>
                      <Td>
                        <span className="block text-xs text-[var(--text-muted)]">
                          From {formatDateTime(coupon.valid_from)}
                        </span>
                        <span className="block text-xs text-[var(--text-muted)]">
                          {coupon.valid_until
                            ? `Until ${formatDateTime(coupon.valid_until)}`
                            : 'No expiry'}
                        </span>
                      </Td>
                      <Td align="right">
                        {coupon.redemption_count}
                        {coupon.max_redemptions != null && (
                          <span className="block text-xs text-[var(--text-muted)]">
                            of {coupon.max_redemptions}
                          </span>
                        )}
                      </Td>
                      <Td align="right">{formatPaise(totals?.discountPaise ?? 0)}</Td>
                      <Td>
                        {!coupon.is_active ? (
                          <Badge>Off</Badge>
                        ) : expired ? (
                          <Badge tone="neutral">Expired</Badge>
                        ) : exhausted ? (
                          <Badge tone="warning">Fully claimed</Badge>
                        ) : (
                          <Badge tone="success">Live</Badge>
                        )}
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </TableShell>
          </Card>
        )}
      </section>
    </div>
  );
}
