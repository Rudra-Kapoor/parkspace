import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { Badge, Card } from '@/components/ui';

export const metadata: Metadata = {
  title: 'About',
  description:
    'Why ParkSpace exists, how it approaches the parking problem, why density in one ' +
    'neighbourhood beats listings spread thin across a city, and what the product will not do.',
  alternates: { canonical: '/about' },
};

const REFUSALS: { title: string; body: string }[] = [
  {
    title: 'We do not show a space we cannot actually deliver',
    body: 'Search returns only inventory that is free for the whole window you asked for. No bait listings, no "call to check", no availability that evaporates at checkout.',
  },
  {
    title: 'We do not publish a host exact address',
    body: 'Before a booking exists, the map shows a deliberately offset point. A driveway should not become a public map pin because somebody browsed a listing.',
  },
  {
    title: 'We do not track where you go',
    body: 'One location reading at check in, one at check out, and only if you allow it. There is no background location, no movement history, and nothing to sell even if we wanted to.',
  },
  {
    title: 'We do not sell personal data',
    body: 'Not to advertisers, not to data brokers, not to anyone. The business model is a percentage of bookings, which only works if bookings keep happening.',
  },
  {
    title: 'We do not hide the cancellation terms',
    body: 'The policy on a space is shown on the listing, on the checkout summary and on the confirmation. A term you only discover when you try to cancel is a trap, not a term.',
  },
  {
    title: 'We do not accept reviews from people who never parked',
    body: 'Only a completed booking earns a review, both sides write one, and neither is published until both are in or the window closes.',
  },
];

export default function AboutPage() {
  return (
    <>
      <SiteHeader />

      <main id="main">
        <section className="border-b bg-[var(--surface-sunken)]">
          <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6 sm:py-20">
            <Badge tone="accent">About</Badge>
            <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
              Parking is not scarce. It is just badly allocated.
            </h1>
            <p className="mt-4 text-base leading-7 text-[var(--text-muted)] sm:text-lg">
              Every Indian city has more parking than it appears to. It is behind gates, under
              buildings and on driveways, and most of it is empty for most of the day.
              ParkSpace exists to make that capacity visible and bookable.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-4 py-14 sm:px-6 sm:py-16">
          <article className="space-y-12">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">The problem</h2>
              <p className="mt-4 leading-7 text-[var(--text-muted)]">
                A driver arrives somewhere they have never been and begins the familiar
                routine. Circle the block. Read a sign that may or may not still apply. Argue
                with an attendant about a space that was supposed to be free. Give up and park
                somewhere questionable, then spend the meeting worrying about the car.
              </p>
              <p className="mt-4 leading-7 text-[var(--text-muted)]">
                A hundred metres away, a driveway has been empty since eight in the morning.
                Its owner would happily take ₹300 for the day and would never think to
                advertise it, because until now there was no sensible way to do that. The
                cost of this mismatch is paid in fuel, in time, in congestion, and in the
                quiet stress of not knowing where the car will go.
              </p>
              <p className="mt-4 leading-7 text-[var(--text-muted)]">
                The gap is not supply. It is information, and a way to make a promise that
                holds.
              </p>
            </div>

            <div>
              <h2 className="text-2xl font-bold tracking-tight">The approach</h2>
              <p className="mt-4 leading-7 text-[var(--text-muted)]">
                Treat a parking space as a resource reserved over an interval of time, and
                make the reservation real. On ParkSpace a confirmed booking is a hard
                reservation of one specific bay, enforced in the database rather than in a
                queue of hopeful requests. Two drivers cannot be sold the same bay for
                overlapping times, because the storage layer refuses to record it.
              </p>
              <p className="mt-4 leading-7 text-[var(--text-muted)]">
                Everything else follows from that promise. Prices are shown in full before you
                commit. Access runs on a QR code at the gate, not on hardware a host has to
                buy. The exact address unlocks 24 hours before the stay and not a minute
                earlier. Both sides review each other. When something goes wrong there is a
                documented process with evidence and a decision at the end of it.
              </p>
              <p className="mt-4 leading-7 text-[var(--text-muted)]">
                Read{' '}
                <Link href="/how-it-works" className="font-medium text-[var(--accent-text)] underline underline-offset-2">
                  how it works
                </Link>{' '}
                for the mechanics on both sides.
              </p>
            </div>

            <div>
              <h2 className="text-2xl font-bold tracking-tight">
                Density beats coverage, every time
              </h2>
              <p className="mt-4 leading-7 text-[var(--text-muted)]">
                The tempting way to grow a marketplace like this is to spread thin: a few
                hundred listings scattered across a dozen cities, a big number on a slide, and
                a map that looks busy from far enough away. It does not work. A driver heading
                to Park Street does not care that there are spaces in another city. They care
                whether there is one within a three minute walk of where they are going, at
                the hour they need it.
              </p>
              <p className="mt-4 leading-7 text-[var(--text-muted)]">
                So the operating principle is density. Enough supply inside one neighbourhood
                that a search almost always returns something walkable, before any effort goes
                into the next neighbourhood. We are starting in Kolkata, around Park Street,
                Esplanade, Camac Street, Salt Lake Sector V, Ballygunge and New Town, and the
                target is 150 live spaces inside a two kilometre radius before we spend
                anything on attracting drivers.
              </p>
              <p className="mt-4 leading-7 text-[var(--text-muted)]">
                A thin map is worse than a small one. A small dense map is a product. A large
                sparse map is a demo.
              </p>
            </div>

            <div>
              <h2 className="text-2xl font-bold tracking-tight">What the product refuses to do</h2>
              <p className="mt-4 leading-7 text-[var(--text-muted)]">
                A marketplace is defined as much by what it declines as by what it ships. Six
                lines we do not cross.
              </p>
              <ul className="mt-6 grid gap-4 sm:grid-cols-2">
                {REFUSALS.map((item) => (
                  <Card as="li" key={item.title} className="p-5">
                    <h3 className="text-sm font-semibold">{item.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{item.body}</p>
                  </Card>
                ))}
              </ul>
            </div>

            <div>
              <h2 className="text-2xl font-bold tracking-tight">How we measure ourselves</h2>
              <p className="mt-4 leading-7 text-[var(--text-muted)]">
                One number, successfully completed parking hours per week. Not signups, not
                app installs, not listings created. Hours in which a driver actually parked
                where they meant to and a host actually got paid. Everything else is a
                supporting metric, and anything that raises the headline while lowering that
                number is not growth.
              </p>
            </div>
          </article>

          <Card className="mt-14 flex flex-col items-start gap-5 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold tracking-tight">Come and use it</h2>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                Either side of the transaction is a good place to start.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/search" className="ps-btn ps-btn-primary">
                Find parking
              </Link>
              <Link href="/list-your-space" className="ps-btn ps-btn-secondary">
                List your space
              </Link>
            </div>
          </Card>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
