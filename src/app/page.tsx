import Link from 'next/link';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { Alert, Card } from '@/components/ui';
import { SearchHero } from '@/components/search-hero';
import { isConfigured } from '@/lib/env';
import { createPublicClient } from '@/lib/supabase/server';
import { formatPaise } from '@/lib/money';

export const revalidate = 300;

/**
 * Landing page.
 *
 * Renders a working search box above the fold, because the only thing a visitor
 * with a car actually wants is to find out whether there is parking where they
 * are going. Everything else on this page is secondary to that box.
 */
export default async function HomePage() {
  const configured = isConfigured();

  let localities: Array<{ slug: string; locality: string; city: string; blurb: string | null }> = [];
  let stats = { spaces: 0, cheapestPaise: 0 };

  if (configured) {
    try {
      const supabase = createPublicClient();

      const [{ data: localityRows }, { count }, { data: cheapest }] = await Promise.all([
        supabase
          .from('seo_localities')
          .select('slug, locality, city, blurb')
          .eq('is_published', true)
          .order('sort_order')
          .limit(8),
        supabase.from('public_spaces').select('id', { count: 'exact', head: true }),
        supabase
          .from('public_spaces')
          .select('price_hourly_paise')
          .not('price_hourly_paise', 'is', null)
          .order('price_hourly_paise', { ascending: true })
          .limit(1),
      ]);

      localities = localityRows ?? [];
      stats = {
        spaces: count ?? 0,
        cheapestPaise: cheapest?.[0]?.price_hourly_paise ?? 0,
      };
    } catch {
      // Configured but unreachable, most likely migrations have not been applied.
      // The page still renders; the setup notice below explains what to do.
    }
  }

  return (
    <>
      <SiteHeader />

      <main id="main">
        {!configured && (
          <div className="mx-auto max-w-4xl px-4 pt-6">
            <Alert tone="warning" title="This deployment is not connected to a database yet">
              <p className="mt-1">
                Copy <code className="rounded bg-[var(--surface)] px-1 py-0.5 text-xs">.env.example</code>{' '}
                to <code className="rounded bg-[var(--surface)] px-1 py-0.5 text-xs">.env.local</code>,
                fill in your Supabase URL and keys, then run{' '}
                <code className="rounded bg-[var(--surface)] px-1 py-0.5 text-xs">npm run db:push</code>.
                The full walkthrough is in{' '}
                <code className="rounded bg-[var(--surface)] px-1 py-0.5 text-xs">README.md</code>.
              </p>
            </Alert>
          </div>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* Hero                                                              */}
        {/* ---------------------------------------------------------------- */}
        <section className="relative overflow-hidden border-b">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(65%_55%_at_50%_0%,var(--accent-soft),transparent_70%)]"
          />

          <div className="relative mx-auto max-w-5xl px-4 pb-16 pt-14 text-center sm:px-6 sm:pt-20">
            <p className="ps-badge ps-badge-accent mx-auto mb-5 w-fit">
              Parking you can count on
            </p>

            <h1 className="mx-auto max-w-3xl text-balance text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl md:text-6xl">
              Book the parking space{' '}
              <span className="text-[var(--accent-text)]">before you leave home</span>
            </h1>

            <p className="mx-auto mt-5 max-w-xl text-balance text-base text-[var(--text-muted)] sm:text-lg">
              Thousands of driveways, garages and private bays sit empty every day while
              drivers circle the block. ParkSpace puts the two together.
            </p>

            <div className="mx-auto mt-9 max-w-3xl">
              <SearchHero />
            </div>

            {stats.spaces > 0 && (
              <p className="mt-4 text-sm text-[var(--text-muted)]">
                {stats.spaces} {stats.spaces === 1 ? 'space' : 'spaces'} available
                {stats.cheapestPaise > 0 && <> from {formatPaise(stats.cheapestPaise)} an hour</>}
              </p>
            )}
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Value props                                                       */}
        {/* ---------------------------------------------------------------- */}
        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
          <div className="grid gap-5 md:grid-cols-3">
            <ValueCard
              title="A booking is a reservation"
              body="When a space is yours, it is yours. The bay is locked to your booking for the whole window, so nobody can sell it twice."
            />
            <ValueCard
              title="You know the price before you go"
              body="The total you see at checkout is the total you pay. Overstay is charged transparently after a 10 minute grace period, never as a surprise."
            />
            <ValueCard
              title="Your address stays private"
              body="Hosts are shown on the map at an approximate point. The exact address and gate instructions go only to a driver with a confirmed booking, 24 hours before they arrive."
            />
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Host CTA                                                          */}
        {/* ---------------------------------------------------------------- */}
        <section className="border-y bg-[var(--surface-sunken)]">
          <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-16 sm:px-6 md:grid-cols-2">
            <div>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Your driveway is empty from nine to six
              </h2>
              <p className="mt-4 text-[var(--text-muted)]">
                So is the one next door, and the office car park down the road. If you have
                space that sits unused while somebody nearby is circling for a spot, you
                have something worth renting.
              </p>
              <p className="mt-3 text-[var(--text-muted)]">
                Listing is free. ParkSpace keeps 10 percent of each booking, so a ₹300
                booking pays you ₹270. You set the hours, the price and the rules.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link href="/list-your-space" className="ps-btn ps-btn-primary">
                  List your space
                </Link>
                <Link href="/how-it-works" className="ps-btn ps-btn-secondary">
                  How hosting works
                </Link>
              </div>
            </div>

            <Card className="p-6">
              <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                An illustration, not a promise
              </p>
              <dl className="mt-4 space-y-3 text-sm">
                <EarningRow label="Weekday rate you set" value="₹40 per hour" />
                <EarningRow label="Hours let per weekday" value="8" />
                <EarningRow label="Weekdays let per month" value="20" />
                <div className="border-t pt-3">
                  <EarningRow label="Gross" value="₹6,400" />
                  <EarningRow label="ParkSpace commission, 10 percent" value="−₹640" muted />
                </div>
                <div className="border-t pt-3">
                  <EarningRow label="You receive" value="₹5,760" strong />
                </div>
              </dl>
              <p className="mt-4 text-xs text-[var(--text-muted)]">
                Worked from the rates on this page. What you actually earn depends on your
                location, your price and how often the space is booked.
              </p>
            </Card>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Neighbourhoods, which double as the local SEO entry points         */}
        {/* ---------------------------------------------------------------- */}
        {localities.length > 0 && (
          <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
            <h2 className="text-2xl font-bold tracking-tight">Parking by neighbourhood</h2>
            <p className="mt-2 text-[var(--text-muted)]">
              We build density one neighbourhood at a time rather than spreading thin across
              a city.
            </p>

            <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {localities.map((locality) => (
                <Link
                  key={locality.slug}
                  href={`/parking/kolkata/${locality.slug}`}
                  className="ps-card group p-5 transition-shadow hover:shadow-[var(--shadow-raised)]"
                >
                  <h3 className="font-semibold group-hover:text-[var(--accent-text)]">
                    Parking in {locality.locality}
                  </h3>
                  <p className="mt-1.5 line-clamp-3 text-sm text-[var(--text-muted)]">
                    {locality.blurb ?? `Find and book parking in ${locality.locality}.`}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>

      <SiteFooter />
    </>
  );
}

function ValueCard({ title, body }: { title: string; body: string }) {
  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">{body}</p>
    </Card>
  );
}

function EarningRow({
  label,
  value,
  muted,
  strong,
}: {
  label: string;
  value: string;
  muted?: boolean;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className={muted ? 'text-[var(--text-muted)]' : ''}>{label}</dt>
      <dd
        className={
          strong
            ? 'text-lg font-bold tabular-nums text-[var(--accent-text)]'
            : 'font-medium tabular-nums'
        }
      >
        {value}
      </dd>
    </div>
  );
}
