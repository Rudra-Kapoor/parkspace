import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { Alert, AmenityIcon, Badge, Card, Stat } from '@/components/ui';

export const metadata: Metadata = {
  title: 'List your space',
  description:
    'Turn an empty driveway, garage or basement bay into income. No listing fee, no hardware, ' +
    'and you keep 90% of what you charge. ParkSpace handles booking, payment and access.',
  alternates: { canonical: '/list-your-space' },
};

const WHO_CAN_HOST: { name: string; icon: string; body: string }[] = [
  {
    name: 'Homeowners',
    icon: 'gated',
    body: 'A driveway or a gated compound that stands empty while you are at work, or a second bay you stopped using when the second car went.',
  },
  {
    name: 'Apartment residents',
    icon: 'lift',
    body: 'An allotted basement or stilt bay you do not use every day. Check your society rules first, see the section below.',
  },
  {
    name: 'Shops',
    icon: 'default',
    body: 'Customer parking that is busy for four hours and idle for the other eight, including all day Sunday.',
  },
  {
    name: 'Restaurants',
    icon: 'attendant',
    body: 'Evening trade means the forecourt earns nothing before six. Sell the daytime hours to office goers.',
  },
  {
    name: 'Offices',
    icon: 'cctv',
    body: 'Visitor bays and staff bays that empty at seven in the evening, at the weekend, and through every holiday.',
  },
  {
    name: 'Hotels',
    icon: 'security_guard',
    body: 'Surplus capacity outside event days, already staffed, already lit, already covered by cameras.',
  },
];

const NEEDED: string[] = [
  'A parking space you have the right to let out. That is the one non negotiable item, and there is an honest section about it further down.',
  'Four or five clear photographs: the bay itself, the entrance, the approach from the road, and anything a first time visitor would get wrong.',
  'A government photo ID for verification.',
  'A bank account or UPI ID in your own legal name for payouts.',
  'Access instructions in your own words. Which gate, which floor, who to ask for, and what the guard needs to hear.',
];

const TRUST_POINTS: { title: string; body: string }[] = [
  {
    title: 'You choose when the space is free',
    body: 'Availability is yours to set by hour, by day or by date range, and you can block any period you need back. Nobody can book outside the windows you opened.',
  },
  {
    title: 'Your address is not public',
    body: 'Search shows an approximate point, offset by 80 to 150 metres, with only the street and the locality. The exact address, the gate number and your instructions go to a driver who has actually booked, and only from 24 hours before the stay.',
  },
  {
    title: 'You know who is coming',
    body: 'Every booking carries a verified account, the vehicle and its registration number, and the arrival and departure times. Check in and check out are recorded, so there is an audit trail if anything is ever questioned.',
  },
  {
    title: 'All money runs through ParkSpace',
    body: 'Drivers pay before they arrive, so there is no cash at the gate and no argument about it. Overstay charges are calculated and collected by us at 1.5 times the hourly rate, never invented at the barrier.',
  },
  {
    title: 'Reviews go both ways',
    body: 'You review the driver, the driver reviews you, and neither review is published until both are in. A driver with a record of leaving late or leaving a mess carries that record with them.',
  },
  {
    title: 'Disputes have a process',
    body: 'If something goes wrong, there is a documented path with evidence, a response window and a human decision at the end of it, rather than a chat thread that goes nowhere.',
  },
];

export default function ListYourSpacePage() {
  return (
    <>
      <SiteHeader />

      <main id="main">
        {/* Hero */}
        <section className="border-b bg-[var(--surface-sunken)]">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-center">
            <div>
              <Badge tone="accent">For hosts</Badge>
              <h1 className="mt-4 max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">
                Your driveway is empty from nine to six. It could be earning.
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--text-muted)] sm:text-lg">
                Somebody within a kilometre of you is circling the block right now looking
                for somewhere legal to leave the car. List your bay, set the hours it is
                genuinely free, and let it pay for itself. No listing fee, no monthly charge,
                no hardware to install.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link href="/host/spaces/new" className="ps-btn ps-btn-primary">
                  List your space
                </Link>
                <Link href="/how-it-works" className="ps-btn ps-btn-secondary">
                  See how it works
                </Link>
              </div>
              <p className="ps-hint mt-4">
                Takes about fifteen minutes. You can save and finish later.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
              <Stat label="You keep" value="90%" hint="ParkSpace commission is 10% of what you charge" tone="accent" />
              <Stat label="Listing fee" value="₹0" hint="No subscription, no joining fee" />
              <Stat label="Hardware needed" value="None" hint="A QR code at the gate is the whole system" />
            </div>
          </div>
        </section>

        {/* Who can host */}
        <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Who can host</h2>
            <p className="mt-3 text-[var(--text-muted)]">
              If you control a parking space that is not in use for part of the week, you can
              list it. Most hosts fall into one of these six groups.
            </p>
          </div>

          <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {WHO_CAN_HOST.map((who) => (
              <Card as="li" key={who.name} className="p-5">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent-text)]">
                  <AmenityIcon name={who.icon} />
                </span>
                <h3 className="mt-3 font-semibold">{who.name}</h3>
                <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">{who.body}</p>
              </Card>
            ))}
          </ul>
        </section>

        {/* What you need and the three steps */}
        <section className="border-y bg-[var(--surface-sunken)]">
          <div className="mx-auto grid max-w-7xl gap-12 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-2 lg:gap-16">
            <div>
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                What you need to get started
              </h2>
              <p className="mt-3 text-[var(--text-muted)]">
                Five things, and you almost certainly have four of them already.
              </p>
              <ul className="mt-8 space-y-4">
                {NEEDED.map((item) => (
                  <li key={item} className="flex gap-3 text-sm leading-7">
                    <span aria-hidden="true" className="mt-2 shrink-0 text-[var(--accent-text)]">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 12l6 6L20 6" />
                      </svg>
                    </span>
                    <span className="min-w-0 text-[var(--text-muted)]">{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                Three steps to live
              </h2>
              <p className="mt-3 text-[var(--text-muted)]">
                Most listings are approved inside a working day.
              </p>
              <ol className="mt-8 space-y-6">
                <Onboarding
                  number={1}
                  title="Describe the space"
                  body="Drop the pin, say how many bays you have, pick the vehicle sizes that fit, tick the amenities, and upload your photographs. The wizard saves as you go."
                />
                <Onboarding
                  number={2}
                  title="Verify and price it"
                  body="Confirm your identity, add your payout details, then set your hourly, daily, overnight or monthly rate. We show you what comparable spaces nearby are charging so you are not guessing."
                />
                <Onboarding
                  number={3}
                  title="Open the calendar"
                  body="Mark the hours the space is genuinely free. The listing goes live once verification clears, and the first booking can land the same day."
                />
              </ol>
              <div className="mt-8">
                <Link href="/host/spaces/new" className="ps-btn ps-btn-primary">
                  Start the listing wizard
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Earnings illustration */}
        <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20">
          <div className="max-w-2xl">
            <Badge tone="warning">Illustration only</Badge>
            <h2 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">
              What the arithmetic looks like
            </h2>
            <p className="mt-3 text-[var(--text-muted)]">
              The numbers below are an illustration of how the split works. They are not a
              forecast, not a promise, and not a typical result. What you actually earn
              depends on your location, your price, and how often the space is booked, and
              it may be nothing at all.
            </p>
          </div>

          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            <Card className="p-6">
              <h3 className="font-semibold">One booking</h3>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                Say you price an overnight stay at ₹300.
              </p>
              <dl className="mt-5 space-y-3 text-sm">
                <Line label="Driver is charged for the space" value="₹300" />
                <Line label="ParkSpace host commission, 10%" value="minus ₹30" />
                <Line label="Paid out to you" value="₹270" emphasis />
              </dl>
              <p className="ps-hint mt-4">
                The driver also pays a 5% service fee on top, which is our charge to them and
                does not come out of your ₹300.
              </p>
            </Card>

            <Card className="p-6">
              <h3 className="font-semibold">Twelve bookings in a month</h3>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                The same ₹300 price, booked twelve times. Purely arithmetic, not a
                projection of demand.
              </p>
              <dl className="mt-5 space-y-3 text-sm">
                <Line label="Twelve bookings at ₹300" value="₹3,600" />
                <Line label="ParkSpace host commission, 10%" value="minus ₹360" />
                <Line label="Paid out to you" value="₹3,240" emphasis />
              </dl>
              <p className="ps-hint mt-4">
                Twelve is a number chosen to make the sum easy to read. It is not a
                prediction of how often your space will be booked.
              </p>
            </Card>
          </div>

          <Alert tone="warning" title="Read this before you count on any of it" className="mt-6">
            ParkSpace is a young marketplace building supply neighbourhood by neighbourhood.
            Until there are enough drivers searching in your area, a listing may sit quiet
            for weeks. We would rather say that here than have you discover it later.
            Earnings are also income in your hands, and how they are taxed is a question for
            your own accountant.
          </Alert>
        </section>

        {/* Trust and safety */}
        <section className="border-y bg-[var(--surface-sunken)]">
          <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20">
            <div className="max-w-2xl">
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                Trust and safety, from your side of the gate
              </h2>
              <p className="mt-3 text-[var(--text-muted)]">
                Letting a stranger park at your home is a real decision. Here is what the
                product does to make it a reasonable one.
              </p>
            </div>

            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {TRUST_POINTS.map((point) => (
                <Card key={point.title} className="p-5">
                  <h3 className="font-semibold">{point.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{point.body}</p>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Before you list */}
        <section className="mx-auto max-w-3xl px-4 py-14 sm:px-6 sm:py-20">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Before you list</h2>
          <p className="mt-3 text-[var(--text-muted)]">
            Three things worth checking first. None of them is a reason not to host, and for
            most people they take one phone call to settle. They are here because it is
            better to know now than after your first booking.
          </p>

          <div className="mt-8 space-y-5">
            <Card className="p-6">
              <h3 className="font-semibold">You must have the right to let the space</h3>
              <p className="mt-2 text-sm leading-7 text-[var(--text-muted)]">
                When you list, you confirm that you either own the space or hold a current
                right to let other people park in it. If you rent, that usually means your
                landlord has agreed in writing. The space also has to be genuinely yours to
                give, so a public road, a footpath, a municipal bay, a fire access route or a
                shared driveway that others need cannot be listed. Our verification is a
                fraud check and a trust signal, and it is not a legal opinion on your right
                to let the space.
              </p>
            </Card>

            <Card className="p-6">
              <h3 className="font-semibold">A housing society may have bye-laws about it</h3>
              <p className="mt-2 text-sm leading-7 text-[var(--text-muted)]">
                If your bay is inside an apartment complex or a gated community, the society
                or apartment owners association may have rules about outsiders entering, about
                who may use an allotted bay, or about commercial use of common areas. Many
                societies are fine with it, particularly where the guard already logs visitors.
                Ask the secretary or the managing committee before you go live, and keep
                whatever they give you in writing. If the society later objects, take the
                listing down and tell us, and we will help you cancel upcoming bookings.
              </p>
            </Card>

            <Card className="p-6">
              <h3 className="font-semibold">
                Commercial parking may be tied to the establishment
              </h3>
              <p className="mt-2 text-sm leading-7 text-[var(--text-muted)]">
                Parking provided with a shop, a restaurant, an office or a hotel is sometimes
                required by the sanctioned building plan or the occupancy certificate to be
                kept for that establishment and its own patrons, staff or visitors. Where that
                condition applies, the bay cannot be let to the general public even when it is
                standing empty. Your architect, your building manager or whoever holds the
                sanctioned plan will know. Surplus capacity beyond the required provision is
                usually the part you can list.
              </p>
            </Card>
          </div>

          <Alert tone="info" title="Where this comes from" className="mt-6">
            These points are drawn from the host agreement, which sets them out in full. Read
            the{' '}
            <Link href="/legal/host-terms" className="font-medium text-[var(--accent-text)] underline underline-offset-2">
              host terms
            </Link>{' '}
            before you list. They are a draft that has not been settled by a lawyer, and that
            is stated plainly on the page.
          </Alert>
        </section>

        {/* Closing call to action */}
        <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6">
          <Card className="flex flex-col items-start gap-5 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
            <div>
              <h2 className="text-xl font-bold tracking-tight">Put the space to work</h2>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                Fifteen minutes to list. Nothing to pay, and you can unlist whenever you like.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/host/spaces/new" className="ps-btn ps-btn-primary">
                List your space
              </Link>
              <Link href="/help#hosting" className="ps-btn ps-btn-secondary">
                Hosting questions
              </Link>
            </div>
          </Card>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}

function Onboarding({ number, title, body }: { number: number; title: string; body: string }) {
  return (
    <li className="flex gap-4">
      <span
        aria-hidden="true"
        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-sm font-bold text-[var(--accent-text)]"
      >
        {number}
      </span>
      <div className="min-w-0">
        <h3 className="font-semibold">{title}</h3>
        <p className="mt-1 text-sm leading-7 text-[var(--text-muted)]">{body}</p>
      </div>
    </li>
  );
}

function Line({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: ReactNode;
  emphasis?: boolean;
}) {
  return (
    <div
      className={
        emphasis
          ? 'flex items-baseline justify-between gap-4 border-t pt-3 font-semibold'
          : 'flex items-baseline justify-between gap-4'
      }
    >
      <dt className={emphasis ? '' : 'text-[var(--text-muted)]'}>{label}</dt>
      <dd className={emphasis ? 'tabular-nums text-[var(--accent-text)]' : 'tabular-nums'}>
        {value}
      </dd>
    </div>
  );
}
