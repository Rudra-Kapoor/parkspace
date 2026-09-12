import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { Alert, Badge, Card, EmptyState } from '@/components/ui';
import { createClient } from '@/lib/supabase/server';
import type { AppNotification } from '@/lib/types';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Notifications',
  robots: { index: false, follow: false },
};

export default async function NotificationsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/auth/login?next=/notifications');

  const { data } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(60);

  const notifications = (data ?? []) as AppNotification[];
  const now = Date.now();

  // A notification with a future send_after has not happened yet. Showing it in
  // the main list would tell someone their booking starts in 30 minutes two days
  // early, which is worse than not showing it at all.
  const delivered = notifications.filter(
    (n) => !n.data?.send_after || new Date(String(n.data.send_after)).getTime() <= now,
  );

  return (
    <>
      <SiteHeader />

      <main id="main" className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>

        <Alert tone="info" className="mt-5">
          This build queues notifications but does not deliver them. There is no email,
          SMS or push provider connected, so everything meant for you appears here and
          nowhere else.
        </Alert>

        {delivered.length === 0 ? (
          <div className="mt-7">
            <EmptyState
              title="Nothing yet"
              description="Booking confirmations, reminders and messages will show up here."
              action={
                <Link href="/search" className="ps-btn ps-btn-primary">
                  Find parking
                </Link>
              }
            />
          </div>
        ) : (
          <Card className="mt-7 divide-y">
            {delivered.map((notification) => {
              const body = (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-semibold">{notification.title}</p>
                    {!notification.read_at && <Badge tone="accent">New</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">{notification.body}</p>
                  <p className="mt-1.5 text-xs text-[var(--text-muted)]">
                    {new Date(notification.created_at).toLocaleString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </>
              );

              return notification.action_url ? (
                <Link
                  key={notification.id}
                  href={notification.action_url}
                  className="block p-4 transition-colors hover:bg-[var(--surface-sunken)]"
                >
                  {body}
                </Link>
              ) : (
                <div key={notification.id} className="p-4">
                  {body}
                </div>
              );
            })}
          </Card>
        )}
      </main>

      <SiteFooter />
    </>
  );
}
