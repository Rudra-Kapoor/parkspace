import type { ReactNode } from 'react';
import Link from 'next/link';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';

const LEGAL_PAGES: { href: string; label: string }[] = [
  { href: '/legal/terms', label: 'Terms of service' },
  { href: '/legal/privacy', label: 'Privacy policy' },
  { href: '/legal/refunds', label: 'Cancellation and refunds' },
  { href: '/legal/host-terms', label: 'Host agreement' },
  { href: '/legal/driver-terms', label: 'Driver agreement' },
  { href: '/legal/cookies', label: 'Cookies and storage' },
  { href: '/legal/guidelines', label: 'Community guidelines' },
  { href: '/legal/grievance', label: 'Grievance officer' },
];

/**
 * Shared shell for every legal page.
 *
 * The index is a horizontally scrollable strip on a phone and a sticky sidebar
 * from large screens up, so a long document never costs the reader their place
 * in the set.
 */
export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader />

      <main id="main" className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="grid gap-8 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-12">
          <nav aria-label="Legal documents" className="min-w-0 lg:sticky lg:top-24 lg:self-start">
            <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
              Legal
            </p>
            <ul className="mt-3 flex gap-2 overflow-x-auto pb-2 lg:mt-4 lg:flex-col lg:gap-1 lg:overflow-visible lg:pb-0">
              {LEGAL_PAGES.map((page) => (
                <li key={page.href} className="shrink-0">
                  <Link
                    href={page.href}
                    className="block whitespace-nowrap rounded-lg border px-3 py-2 text-sm font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text)] lg:border-transparent lg:whitespace-normal"
                  >
                    {page.label}
                  </Link>
                </li>
              ))}
            </ul>

            <p className="ps-hint mt-6 hidden lg:block">
              Every document in this set is an unreviewed draft. None of it has been settled by
              a lawyer.
            </p>
          </nav>

          <article className="min-w-0 max-w-3xl">{children}</article>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
