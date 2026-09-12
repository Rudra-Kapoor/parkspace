import type { Metadata } from 'next';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import Link from 'next/link';
import { Alert, Badge, EmptyState } from '@/components/ui';
import { Markdown } from '@/components/markdown';

export const metadata: Metadata = {
  title: 'Driver agreement',
  description:
    'The draft agreement between a driver and ParkSpace, covering bookings, payment, the ' +
    'grace period, overstay, check in and conduct. An unreviewed draft.',
  alternates: { canonical: '/legal/driver-terms' },
  robots: { index: false, follow: true },
};

// Read on every request so the published page always matches the document in the
// repository rather than a copy baked in at build time.
export const dynamic = 'force-dynamic';

const DOCUMENT = '22_Driver_Terms.md';

async function loadDocument(): Promise<string | null> {
  try {
    const raw = await readFile(path.join(process.cwd(), 'docs', DOCUMENT), 'utf8');
    return raw.replace(/^#\s+.*\r?\n?/, '').trimStart();
  } catch {
    return null;
  }
}

export default async function DriverTermsPage() {
  const body = await loadDocument();

  return (
    <>
      <header>
        <Badge tone="accent">Legal</Badge>
        <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Driver agreement</h1>
        <p className="mt-3 text-[var(--text-muted)]">
          What you agree to when you book a space: the price you pay, the 10 minute grace
          period, what an overstay costs, how check in works, and what happens when a space is
          not usable. The plain language version lives in the{' '}
          <Link href="/help" className="font-medium text-[var(--accent-text)] underline underline-offset-2">
            help centre
          </Link>
          .
        </p>
      </header>

      <Alert tone="warning" title="Unreviewed draft. Do not rely on this document." className="mt-6">
        This text has not been settled by a lawyer and has not been reviewed by a chartered
        accountant. It is not legal advice, it binds nobody, and no part of it should be relied
        upon. Passages marked REVIEW REQUIRED are known open questions that must be answered by
        qualified counsel before this page can be treated as real.
      </Alert>

      <div className="mt-8">
        {body === null ? (
          <EmptyState
            title="This document is not available right now"
            description="The source file could not be read. It may have been moved or renamed. The help centre covers the same ground in plainer language."
            action={
              <Link href="/help" className="ps-btn ps-btn-secondary">
                Go to the help centre
              </Link>
            }
          />
        ) : (
          <Markdown source={body} />
        )}
      </div>
    </>
  );
}
