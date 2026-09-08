import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteHeader } from '@/components/site-header';
import { AuthForm } from '@/components/auth-form';

export const metadata: Metadata = {
  title: 'Sign in',
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;

  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto flex max-w-md flex-col justify-center px-4 py-16">
        <h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>
        <p className="mt-1.5 text-sm text-[var(--text-muted)]">
          Sign in to manage your bookings and your spaces.
        </p>

        <div className="mt-7">
          <AuthForm mode="login" nextPath={params.next ?? '/'} initialError={params.error} />
        </div>

        <p className="mt-6 text-center text-sm text-[var(--text-muted)]">
          New to ParkSpace?{' '}
          <Link
            href={`/auth/register${params.next ? `?next=${encodeURIComponent(params.next)}` : ''}`}
            className="font-semibold text-[var(--accent-text)] hover:underline"
          >
            Create an account
          </Link>
        </p>
      </main>
    </>
  );
}
