import type { Metadata } from 'next';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import Link from 'next/link';
import { Alert, Badge, EmptyState } from '@/components/ui';
import { Markdown } from '@/components/markdown';

export const metadata: Metadata = {
  title: 'Cancellation and refunds',
  description:
    'The four cancellation policies, worked examples for each, what happens when a host ' +
    'cancels or a space is unusable, and how long a refund takes. An unreviewed draft.',
  alternates: { canonical: '/legal/refunds' },
  robots: { index: false, follow: true },
};

// Read on every request so the published page always matches the document in the
// repository rather than a copy baked in at build time.
export const dynamic = 'force-dynamic';

const DOCUMENT = '23_Refund_Policy.md';

async function loadDocument(): Promise<string | null> {
  try {
    const raw = await readFile(path.join(process.cwd(), 'docs', DOCUMENT), 'utf8');
    return raw.replace(/^#\s+.*\r?\n?/, '').trimStart();
  } catch {
    return null;
  }
}

export default async function RefundsPage() {
  const body = await loadDocument();

  return (
    <>
      <header>
        <Badge tone="accent">Legal</Badge>
        <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
          Cancellation and refunds
        </h1>
        <p className="mt-3 text-[var(--text-muted)]">
          Every space carries one of four policies, flexible, moderate, strict or non
          refundable, and it is shown on the listing, at checkout and on your confirmation. The
          document below works each one through with real arithmetic. For a quick answer, the{' '}
          <Link href="/help#cancellations" className="font-medium text-[var(--accent-text)] underline underline-offset-2">
            help centre
          </Link>{' '}
          has the same rules in a single table.
        </p>
      </header>

      <Alert tone="warning" title="Unreviewed draft. Do not rely on this document." className="mt-6">
        This text has not been settled by a lawyer and has not been reviewed by a chartered
        accountant. It is not legal advice, it binds nobody, and no part of it should be relied
        upon. The tax treatment of retained and forfeited amounts is unresolved, and the refund
        timelines are indicative rather than a commitment. Passages marked REVIEW REQUIRED are
        known open questions that must be answered by qualified counsel before this page can be
        treated as real.
      </Alert>

      <div className="mt-8">
        {body === null ? (
          <EmptyState
            title="This document is not available right now"
            description="The source file could not be read. It may have been moved or renamed. The cancellations section of the help centre states the four policies in full."
            action={
              <Link href="/help#cancellations" className="ps-btn ps-btn-secondary">
                Go to the cancellation help
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
