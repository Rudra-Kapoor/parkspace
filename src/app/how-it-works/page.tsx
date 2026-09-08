import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { Badge, Card } from '@/components/ui';

export const metadata: Metadata = {
  title: 'How it works',
  description:
    'How ParkSpace works for drivers and for hosts: search, compare, reserve and check in, ' +
    'or list a space, set your price and get paid. Plus the guarantees behind every booking.',
  alternates: { canonical: '/how-it-works' },
};

type Step = { title: string; body: string };

const DRIVER_STEPS: Step[] = [
  {
    title: 'Search where you are actually going',
    body: 'Type a destination, a landmark or a pin on the map, then set the time you need. Search only returns spaces that are genuinely free for that whole window, so nothing you see is a maybe.',
  },
  {
    title: 'Compare on the things that matter',
    body: 'Price for your exact duration, walking distance to your destination, whether the space is covered, gated, lit or has an attendant, the vehicle sizes it takes, and the host rating. The cancellation policy is shown before you commit, not after.',
  },
  {
    title: 'Reserve the bay',
    body: 'Choosing a space puts a hold on that specific bay while you pay. The hold lasts 10 minutes, which is long enough to finish checkout and short enough that a space is never parked out of the market by an abandoned tab.',
  },
  {
    title: 'Navigate on the day',
    body: 'Your booking carries directions, the access instructions and anything the host wants you to know, such as which gate to use or who to ask for. The exact address appears from 24 hours before your stay begins.',
  },
  {
    title: 'Check in when you arrive',
    body: 'Open the booking and scan the QR code at the gate, or use the check in control. Check in records the time and, only if you allow it, a single location reading to confirm you are at the space. There is no tracking before or after that moment.',
  },
  {
    title: 'Check out when you leave',
    body: 'Check out closes the booking and releases the bay for whoever is next. You have a 10 minute grace period after your end time. Leave within it and there is nothing more to pay.',
  },
];

const HOST_STEPS: Step[] = [
  {
    title: 'List the space',
    body: 'The listing wizard asks for the location, how many bays you have, what vehicles fit, the amenities, photographs and your access instructions. It takes about fifteen minutes and you can save and come back.',
  },
  {
    title: 'Get verified',
    body: 'We check your identity and your photographs before the listing goes live. Verification is a fraud control and a trust signal for drivers. It is not a legal opinion on your right to let the space, which stays your responsibility.',
  },
  {
    title: 'Set availability and price',
    body: 'Choose the hours and days the space is genuinely free, set an hourly, daily, overnight or monthly price, and block out the dates you need it yourself. You can change any of this whenever you like, and a change never disturbs a booking already confirmed.',
  },
  {
    title: 'Receive bookings',
    body: 'Drivers book the bay directly. You get a notification with the arrival time, the vehicle and the registration number. Because availability and bookings live on the same inventory, two drivers can never be sold the same bay for overlapping times.',
  },
  {
    title: 'Get paid',
    body: 'Once the stay completes, the payout is queued to your registered payout account. ParkSpace keeps a 10% host commission on the amount you charged, so a ₹300 booking pays you ₹270. There is no listing fee and no monthly charge.',
  },
];

const FAQS: { q: string; a: ReactNode }[] = [
  {
    q: 'Is a confirmed booking really guaranteed?',
    a: (
      <>
        Yes. A confirmed booking is a hard reservation of one specific bay for one specific
        period. The database itself refuses to store two overlapping bookings on the same
        bay, so double booking is structurally impossible rather than merely unlikely. If a
        host ever fails to make a confirmed space usable, you get a full refund including
        the service fee.
      </>
    ),
  },
  {
    q: 'When do I see the exact address?',
    a: (
      <>
        From 24 hours before your booking starts, and not before. Until then, search and the
        listing page show an approximate point offset by 80 to 150 metres, plus the street
        and the locality. This protects hosts from having their driveway mapped by people
        who never intend to book.
      </>
    ),
  },
  {
    q: 'What does it cost?',
    a: (
      <>
        Drivers pay the host price plus a 5% platform service fee and any tax on that fee.
        Hosts pay a 10% commission on the amount they charged, and nothing else. There is no
        subscription on either side.
      </>
    ),
  },
  {
    q: 'What happens if I am late?',
    a: (
      <>
        Nothing. The bay is yours for the whole period you booked, whether you arrive on
        time or an hour late, and the host must not relet it. What you cannot do is stay
        past your end time, because the next driver may be on the way.
      </>
    ),
  },
  {
    q: 'What if I stay longer than I booked?',
    a: (
      <>
        There is a 10 minute grace period after your end time. Beyond that an overstay
        charge accrues from your original end time at 1.5 times the space hourly rate. If
        the bay is still free, extend the booking in the app before your end time instead,
        which is always cheaper.
      </>
    ),
  },
  {
    q: 'How do reviews work?',
    a: (
      <>
        Both sides review each other after the stay, and neither review is published until
        both have been written or the window closes. That stops retaliation and keeps the
        ratings worth reading. Reviews can only be left by someone who actually completed a
        booking.
      </>
    ),
  },
  {
    q: 'Can I cancel?',
    a: (
      <>
        Each space carries one of four policies, flexible, moderate, strict or non
        refundable, and the policy is shown before you pay. Details for each are in the{' '}
        <Link href="/help#cancellations" className="font-medium text-[var(--accent-text)] underline underline-offset-2">
          help centre
        </Link>
        .
      </>
    ),
  },
  {
    q: 'Do I need a smart lock or any hardware to host?',
    a: (
      <>
        No. Access runs on a QR code the driver scans at the gate and on the instructions you
        write, which is why an ordinary driveway with an ordinary gate can go live the same
        day. Hardware integrations are deliberately out of scope.
      </>
    ),
  },
];

export default function HowItWorksPage() {
  return (
    <>
      <SiteHeader />

      <main id="main">
        {/* Hero */}
        <section className="border-b bg-[var(--surface-sunken)]">
          <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20">
            <Badge tone="accent">How it works</Badge>
            <h1 className="mt-4 max-w-3xl text-3xl font-bold tracking-tight sm:text-4xl">
              Two sides of the same street
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--text-muted)] sm:text-lg">
              One person has a driveway sitting empty from nine to six. Another circles the
              block for twenty minutes looking for somewhere legal to leave the car.
              ParkSpace is the booking layer between them, and it works the same way every
              time.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/search" className="ps-btn ps-btn-primary">
                Find parking
              </Link>
              <Link href="/list-your-space" className="ps-btn ps-btn-secondary">
                List your space
              </Link>
            </div>
          </div>
        </section>

        {/* The two tracks */}
        <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20">
          <div className="grid gap-10 lg:grid-cols-2 lg:gap-14">
            <Track
              eyebrow="For drivers"
              title="From searching to parked, in six steps"
              intro="Everything you need to know before you arrive is settled before you set off."
              steps={DRIVER_STEPS}
              action={
                <Link href="/search" className="ps-btn ps-btn-primary">
                  Search for a space
                </Link>
              }
            />
            <Track
              eyebrow="For hosts"
              title="From empty driveway to paid, in five steps"
              intro="No hardware, no listing fee, and you keep control of when the space is available."
              steps={HOST_STEPS}
              action={
                <Link href="/host/spaces/new" className="ps-btn ps-btn-primary">
                  List your space
                </Link>
              }
            />
          </div>
        </section>

        {/* Guarantees */}
        <section className="border-y bg-[var(--surface-sunken)]">
          <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20">
            <div className="max-w-2xl">
              <Badge tone="accent">The guarantees</Badge>
              <h2 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">
                Four promises the product is built around
              </h2>
              <p className="mt-3 text-[var(--text-muted)]">
                These are not marketing lines. Each one is enforced by the system rather
                than by a policy someone is asked to remember.
              </p>
            </div>

            <div className="mt-10 grid gap-5 sm:grid-cols-2">
              <Guarantee title="A confirmed booking is a hard reservation">
                When your booking is confirmed, one named bay is held for your exact period.
                The database applies an exclusion rule that makes two overlapping bookings on
                the same bay impossible to save, so there is no race to lose and no oversold
                space to apologise for. If a host cannot deliver a confirmed space, you are
                refunded in full, service fee included.
              </Guarantee>

              <Guarantee title="The exact address is released 24 hours before, not before">
                Until then you see an approximate point, deliberately offset by 80 to 150
                metres, with the street and the locality. The full address, the gate number
                and the access instructions unlock 24 hours ahead of your stay, and only for
                the driver holding that booking. The rule is enforced in the database, so no
                screen and no API call can leak it early.
              </Guarantee>

              <Guarantee title="Reviews go both ways">
                Drivers review hosts and hosts review drivers. Neither review appears until
                both are in or the window closes, which removes the incentive to write a
                retaliatory one. Only a completed booking earns the right to review, so the
                ratings describe real stays.
              </Guarantee>

              <Guarantee title="A 10 minute grace period">
                Traffic happens, and so do lifts that take forever. Check out within 10
                minutes of your end time and there is nothing extra to pay. Past that, an
                overstay charge runs from the original end time at 1.5 times the hourly
                rate, and it is settled through ParkSpace so a host can never invent a
                charge of their own at the gate.
              </Guarantee>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="mx-auto max-w-3xl px-4 py-14 sm:px-6 sm:py-20">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Common questions</h2>
          <p className="mt-3 text-[var(--text-muted)]">
            Eight quick answers. The{' '}
            <Link href="/help" className="font-medium text-[var(--accent-text)] underline underline-offset-2">
              help centre
            </Link>{' '}
            has the long version.
          </p>

          <div className="mt-8 divide-y rounded-xl border">
            {FAQS.map((faq) => (
              <details key={faq.q} className="group px-4 py-1 [&_summary]:list-none">
                <summary className="flex cursor-pointer items-start gap-3 py-4 text-left font-semibold">
                  <span className="mt-0.5 shrink-0 text-[var(--text-muted)] transition-transform group-open:rotate-90">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  </span>
                  <span className="min-w-0">{faq.q}</span>
                </summary>
                <div className="pb-4 pl-7 text-sm leading-7 text-[var(--text-muted)]">
                  {faq.a}
                </div>
              </details>
            ))}
          </div>
        </section>

        {/* Closing call to action */}
        <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6">
          <Card className="flex flex-col items-start gap-5 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
            <div>
              <h2 className="text-xl font-bold tracking-tight">Ready either way</h2>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                Book a space for this evening, or put your own driveway to work.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/search" className="ps-btn ps-btn-primary">
                Find parking
              </Link>
              <Link href="/list-your-space" className="ps-btn ps-btn-secondary">
                Become a host
              </Link>
            </div>
          </Card>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}

function Track({
  eyebrow,
  title,
  intro,
  steps,
  action,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  steps: Step[];
  action: ReactNode;
}) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wider text-[var(--accent-text)]">
        {eyebrow}
      </p>
      <h2 className="mt-2 text-2xl font-bold tracking-tight">{title}</h2>
      <p className="mt-2 text-[var(--text-muted)]">{intro}</p>

      <ol className="mt-8 space-y-6">
        {steps.map((step, index) => (
          <li key={step.title} className="flex gap-4">
            <span
              aria-hidden="true"
              className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-sm font-bold text-[var(--accent-text)]"
            >
              {index + 1}
            </span>
            <div className="min-w-0">
              <h3 className="font-semibold">{step.title}</h3>
              <p className="mt-1 text-sm leading-7 text-[var(--text-muted)]">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-8">{action}</div>
    </div>
  );
}

function Guarantee({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="p-6">
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-7 text-[var(--text-muted)]">{children}</p>
    </Card>
  );
}
