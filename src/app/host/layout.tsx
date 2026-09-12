import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { SiteHeader } from '@/components/site-header';
import { DashNav, type DashNavItem } from '@/components/dash-nav';
import { Alert } from '@/components/ui';
import { isConfigured } from '@/lib/env';
import { getCurrentProfile } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Hosting',
  robots: { index: false, follow: false },
};

const NAV: DashNavItem[] = [
  { href: '/host', label: 'Overview' },
  { href: '/host/spaces', label: 'Spaces' },
  { href: '/host/calendar', label: 'Calendar' },
  { href: '/host/bookings', label: 'Bookings' },
  { href: '/host/earnings', label: 'Earnings' },
  { href: '/host/reviews', label: 'Reviews' },
  { href: '/host/settings', label: 'Settings' },
];

/**
 * The host shell.
 *
 * The session check here is a courtesy, not the security boundary. Row Level
 * Security is what actually scopes every query on every page inside this
 * layout to the signed-in host, so a mistake here leaks nothing.
 */
export default async function HostLayout({ children }: { children: React.ReactNode }) {
  if (!isConfigured()) {
    return (
      <>
        <SiteHeader />
        <main id="main" className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
          <h1 className="text-2xl font-bold tracking-tight">Hosting is not available yet</h1>
          <div className="mt-5">
            <Alert tone="warning" title="This deployment is not connected to a database">
              <p className="mt-1">
                Copy <code className="rounded bg-[var(--surface)] px-1 py-0.5 text-xs">.env.example</code>{' '}
                to <code className="rounded bg-[var(--surface)] px-1 py-0.5 text-xs">.env.local</code>,
                fill in the Supabase URL and keys, then run{' '}
                <code className="rounded bg-[var(--surface)] px-1 py-0.5 text-xs">npm run db:push</code>.
              </p>
            </Alert>
          </div>
        </main>
      </>
    );
  }

  let profile: { id: string; full_name: string | null } | null = null;
  try {
    profile = await getCurrentProfile();
  } catch {
    // Configured but unreachable. Treat it as signed out rather than crashing;
    // the sign-in page will surface the real problem.
    profile = null;
  }

  if (!profile) redirect('/auth/login?next=/host');

  return (
    <>
      <SiteHeader />
      <div className="mx-auto w-full max-w-7xl gap-8 px-4 py-6 sm:px-6 lg:flex lg:py-8">
        <DashNav items={NAV} ariaLabel="Hosting" />
        <main id="main" className="min-w-0 flex-1 pt-6 lg:pt-0">
          {children}
        </main>
      </div>
    </>
  );
}
