import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteHeader } from '@/components/site-header';
import { DashNav, type DashNavItem } from '@/components/dash-nav';
import { Alert, Card } from '@/components/ui';
import { isConfigured } from '@/lib/env';
import { requireRole } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Admin',
  robots: { index: false, follow: false },
};

const NAV: DashNavItem[] = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/spaces', label: 'Moderation' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/bookings', label: 'Bookings' },
  { href: '/admin/payments', label: 'Payments' },
  { href: '/admin/disputes', label: 'Disputes' },
  { href: '/admin/coupons', label: 'Coupons' },
  { href: '/admin/settings', label: 'Settings' },
  { href: '/admin/audit', label: 'Audit log' },
];

/**
 * The admin shell.
 *
 * Somebody who is signed in but is not an admin is told so plainly. Bouncing
 * them to a login page they are already past is the single most confusing thing
 * an authorisation failure can do: it implies the credentials were wrong when
 * the credentials were fine and the permission was not.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!isConfigured()) {
    return (
      <AdminMessage title="The admin panel is not available yet">
        <Alert tone="warning" title="This deployment is not connected to a database">
          <p className="mt-1">
            Fill in the Supabase values in{' '}
            <code className="rounded bg-[var(--surface)] px-1 py-0.5 text-xs">.env.local</code> and
            run <code className="rounded bg-[var(--surface)] px-1 py-0.5 text-xs">npm run db:push</code>.
          </p>
        </Alert>
      </AdminMessage>
    );
  }

  let gate: Awaited<ReturnType<typeof requireRole>>;
  try {
    gate = await requireRole(['admin', 'support']);
  } catch {
    return (
      <AdminMessage title="The admin panel could not load">
        <Alert tone="warning" title="The database did not respond">
          <p className="mt-1">
            Check that the project is running and that the migrations have been applied.
          </p>
        </Alert>
      </AdminMessage>
    );
  }

  if (!gate.ok) {
    if (gate.reason === 'unauthenticated') {
      return (
        <AdminMessage title="Sign in to continue">
          <p className="text-[var(--text-muted)]">
            The admin panel needs an account with an admin or support role.
          </p>
          <p className="mt-4">
            <Link href="/auth/login?next=/admin" className="ps-btn ps-btn-primary">
              Sign in
            </Link>
          </p>
        </AdminMessage>
      );
    }

    if (gate.reason === 'suspended') {
      return (
        <AdminMessage title="Your account is on hold">
          <p className="text-[var(--text-muted)]">
            A suspended account cannot use the admin panel. Contact another administrator to have
            the hold reviewed.
          </p>
        </AdminMessage>
      );
    }

    return (
      <AdminMessage title="You do not have access to this area">
        <p className="text-[var(--text-muted)]">
          You are signed in, but this account does not hold an admin or support role. Nothing is
          wrong with your sign in, and there is nothing to retry: ask an administrator to grant the
          role if you need it.
        </p>
        <p className="mt-4 flex flex-wrap gap-3">
          <Link href="/" className="ps-btn ps-btn-secondary">
            Back to ParkSpace
          </Link>
          <Link href="/host" className="ps-btn ps-btn-ghost">
            Go to hosting
          </Link>
        </p>
      </AdminMessage>
    );
  }

  return (
    <>
      <SiteHeader variant="compact" />
      <div className="mx-auto w-full max-w-7xl gap-8 px-4 py-6 sm:px-6 lg:flex lg:py-8">
        <DashNav items={NAV} ariaLabel="Administration" />
        <main id="main" className="min-w-0 flex-1 pt-6 lg:pt-0">
          {children}
        </main>
      </div>
    </>
  );
}

function AdminMessage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <SiteHeader variant="compact" />
      <main id="main" className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        <Card className="p-6 sm:p-8">
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          <div className="mt-4">{children}</div>
        </Card>
      </main>
    </>
  );
}
