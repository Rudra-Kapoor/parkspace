import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { Alert, Card, EmptyState, Stat } from '@/components/ui';
import { ReferralShare } from '@/components/referral-share';
import { createClient } from '@/lib/supabase/server';
import { formatPaise } from '@/lib/money';
import type { WalletTransaction } from '@/lib/types';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Credit and referrals',
  robots: { index: false, follow: false },
};

const TXN_LABELS: Record<string, string> = {
  refund_credit: 'Refund',
  referral_credit: 'Referral reward',
  promo_credit: 'Promotional credit',
  compensation: 'Compensation',
  booking_spend: 'Used on a booking',
  withdrawal: 'Withdrawn',
  adjustment: 'Adjustment',
};

export default async function WalletPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/auth/login?next=/wallet');

  const [{ data: profile }, { data: transactions }, { data: referrals }] = await Promise.all([
    supabase
      .from('profiles')
      .select('wallet_balance_paise, referral_code')
      .eq('id', user.id)
      .single(),
    supabase
      .from('wallet_transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase.from('referrals').select('status, reward_paise').eq('referrer_id', user.id),
  ]);

  const txns = (transactions ?? []) as WalletTransaction[];
  const referralList = referrals ?? [];
  const rewarded = referralList.filter((r) => r.status === 'rewarded').length;
  const pending = referralList.filter((r) => r.status === 'pending').length;

  return (
    <>
      <SiteHeader />

      <main id="main" className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <h1 className="text-2xl font-bold tracking-tight">Credit and referrals</h1>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <Stat
            label="Credit balance"
            value={formatPaise(profile?.wallet_balance_paise ?? 0)}
            tone="accent"
          />
          <Stat label="Friends joined" value={String(rewarded)} />
          <Stat label="Awaiting first booking" value={String(pending)} hint="Rewards release then" />
        </div>

        <Alert tone="info" className="mt-5">
          Credit is applied automatically at checkout when you choose to use it. It reduces
          what you pay without reducing what the host earns, because it is our cost, not
          theirs.
        </Alert>

        {profile?.referral_code && (
          <div className="mt-6">
            <ReferralShare code={profile.referral_code} />
          </div>
        )}

        <section className="mt-9">
          <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--text-muted)]">
            History
          </h2>

          {txns.length === 0 ? (
            <div className="mt-3">
              <EmptyState
                title="Nothing here yet"
                description="Refunds, referral rewards and promotional credit will appear here as they happen."
              />
            </div>
          ) : (
            <Card className="mt-3 divide-y">
              {txns.map((txn) => (
                <div key={txn.id} className="flex items-center justify-between gap-4 p-4">
                  <div className="min-w-0">
                    <p className="font-medium">{TXN_LABELS[txn.txn_type] ?? txn.txn_type}</p>
                    {txn.note && (
                      <p className="mt-0.5 truncate text-sm text-[var(--text-muted)]">{txn.note}</p>
                    )}
                    <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                      {new Date(txn.created_at).toLocaleString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      className={`font-semibold tabular-nums ${
                        txn.amount_paise > 0
                          ? 'text-[var(--accent-text)]'
                          : 'text-[var(--text-muted)]'
                      }`}
                    >
                      {txn.amount_paise > 0 ? '+' : '−'}
                      {formatPaise(Math.abs(txn.amount_paise))}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                      Balance {formatPaise(txn.balance_after_paise)}
                    </p>
                  </div>
                </div>
              ))}
            </Card>
          )}
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
