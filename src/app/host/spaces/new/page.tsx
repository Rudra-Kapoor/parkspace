import type { Metadata } from 'next';
import Link from 'next/link';
import { ListingWizard } from './listing-wizard';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'New listing',
  robots: { index: false, follow: false },
};

/**
 * The new listing page is deliberately thin: the wizard is entirely client
 * state until the final submit, because a seven step form that round trips to
 * the server between steps is a form people abandon.
 */
export default function NewListingPage() {
  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm">
          <Link href="/host/spaces" className="text-[var(--text-muted)] hover:underline">
            Your spaces
          </Link>
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">List a parking space</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Seven short steps. Your progress is kept in this browser, so you can close the tab and
          come back.
        </p>
      </header>

      <ListingWizard />
    </div>
  );
}
