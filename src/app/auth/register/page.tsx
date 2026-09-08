import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteHeader } from '@/components/site-header';
import { AuthForm } from '@/components/auth-form';

export const metadata: Metadata = {
  title: 'Create an account',
  robots: { index: false, follow: false },
};

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;

  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto flex max-w-md flex-col justify-center px-4 py-16">
        <h1 className="text-2xl font-bold tracking-tight">Create your account</h1>
        <p className="mt-1.5 text-sm text-[var(--text-muted)]">
          One account books parking and lists it.
        </p>

        <div className="mt-7">
          <AuthForm mode="register" nextPath={params.next ?? '/'} />
        </div>

        <p className="mt-6 text-center text-sm text-[var(--text-muted)]">
          Already have an account?{' '}
          <Link
            href={`/auth/login${params.next ? `?next=${encodeURIComponent(params.next)}` : ''}`}
            className="font-semibold text-[var(--accent-text)] hover:underline"
          >
            Sign in
          </Link>
        </p>
      </main>
    </>
  );
}
