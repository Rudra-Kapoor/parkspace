import type { Metadata } from 'next';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import Link from 'next/link';
import { Alert, Badge, EmptyState } from '@/components/ui';
import { Markdown } from '@/components/markdown';

export const metadata: Metadata = {
  title: 'Privacy policy',
  description:
    'What ParkSpace collects, why, who else sees it, how long it is kept and what you can ask ' +
    'us to do about it. An unreviewed draft.',
  alternates: { canonical: '/legal/privacy' },
  robots: { index: false, follow: true },
};

// Read on every request so the published page always matches the document in the
// repository rather than a copy baked in at build time.
export const dynamic = 'force-dynamic';

const DOCUMENT = '24_Privacy_Policy.md';

async function loadDocument(): Promise<string | null> {
  try {
    const raw = await readFile(path.join(process.cwd(), 'docs', DOCUMENT), 'utf8');
    return raw.replace(/^#\s+.*\r?\n?/, '').trimStart();
  } catch {
    return null;
  }
}

export default async function PrivacyPage() {
  const body = await loadDocument();

  return (
    <>
      <header>
        <Badge tone="accent">Legal</Badge>
        <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Privacy policy</h1>
        <p className="mt-3 text-[var(--text-muted)]">
          Three things up front. We do not sell personal data. We do not track your location,
          beyond one reading at check in and one at check out, each with your permission. A host
          exact address is never public and reaches a driver only 24 hours before their booking.
          What is stored in your browser is set out separately under{' '}
          <Link href="/legal/cookies" className="font-medium text-[var(--accent-text)] underline underline-offset-2">
            cookies and storage
          </Link>
          .
        </p>
      </header>

      <Alert tone="warning" title="Unreviewed draft. Do not rely on this document." className="mt-6">
        This text has not been settled by a lawyer and has not been reviewed by a chartered
        accountant. It is not legal advice, it binds nobody, and no part of it should be relied
        upon. Several passages depend on rules under the Digital Personal Data Protection Act
        2023 that may not yet be notified. Passages marked REVIEW REQUIRED are known open
        questions that must be answered by qualified counsel before this page can be treated as
        real.
      </Alert>

      <div className="mt-8">
        {body === null ? (
          <EmptyState
            title="This document is not available right now"
            description="The source file could not be read. It may have been moved or renamed. The safety section of the help centre summarises what we hold and why."
            action={
              <Link href="/help#safety" className="ps-btn ps-btn-secondary">
                Go to the safety help
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
