'use client';

import { useEffect } from 'react';
import Link from 'next/link';

/**
 * Error boundary.
 *
 * Without this file, a thrown error in any page renders Next.js's default
 * screen, which in production is a bare "Application error" and in development
 * is a stack trace. Neither tells a driver standing in a car park what to do.
 *
 * The digest is shown deliberately. It is the only thing that links what the
 * user saw to what the logs recorded, and asking somebody to describe an error
 * they cannot name wastes everyone's time.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Server-side digests already reach the platform logs. This covers the
    // client-side half.
    console.error('[boundary]', error.message, error.digest ?? '');
  }, [error]);

  return (
    <main
      id="main"
      className="mx-auto flex min-h-[70vh] max-w-lg flex-col items-center justify-center px-4 text-center"
    >
      <h1 className="text-2xl font-bold tracking-tight">Something went wrong at our end</h1>

      <p className="mt-3 text-[var(--text-muted)]">
        This is not your fault and nothing you were doing has been lost. If you were in the
        middle of a booking, it has not been charged.
      </p>

      <div className="mt-7 flex flex-wrap justify-center gap-2">
        <button type="button" onClick={reset} className="ps-btn ps-btn-primary">
          Try again
        </button>
        <Link href="/" className="ps-btn ps-btn-secondary">
          Back to the start
        </Link>
        <Link href="/bookings" className="ps-btn ps-btn-ghost">
          My bookings
        </Link>
      </div>

      {error.digest && (
        <p className="mt-8 text-xs text-[var(--text-muted)]">
          If you contact us, quote this reference:{' '}
          <code className="rounded bg-[var(--surface-sunken)] px-1.5 py-0.5 font-mono">
            {error.digest}
          </code>
        </p>
      )}
    </main>
  );
}
