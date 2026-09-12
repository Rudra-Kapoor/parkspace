import Link from 'next/link';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';

/**
 * 404.
 *
 * Reached most often by a driver following a link to a listing that has since
 * been delisted, so the copy says that rather than the generic "page not found",
 * and the primary action is a search rather than the homepage.
 */
export default function NotFound() {
  return (
    <>
      <SiteHeader />

      <main
        id="main"
        className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-4 text-center"
      >
        <p className="font-mono text-sm text-[var(--text-muted)]">404</p>

        <h1 className="mt-2 text-2xl font-bold tracking-tight">We cannot find that page</h1>

        <p className="mt-3 text-[var(--text-muted)]">
          If you were looking at a parking space, the host may have taken it off the market.
          There are usually others nearby.
        </p>

        <div className="mt-7 flex flex-wrap justify-center gap-2">
          <Link href="/search" className="ps-btn ps-btn-primary">
            Find parking nearby
          </Link>
          <Link href="/" className="ps-btn ps-btn-secondary">
            Back to the start
          </Link>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
