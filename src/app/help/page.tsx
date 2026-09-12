import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { Alert, Badge, Card } from '@/components/ui';

export const metadata: Metadata = {
  title: 'Help centre',
  description:
    'Answers on booking, payments, access and check in, cancellations and refunds, hosting, ' +
    'safety and your account. Holds last 10 minutes, the grace period is 10 minutes, and the ' +
    'exact address is released 24 hours before your stay.',
  alternates: { canonical: '/help' },
};

type Faq = { q: string; a: ReactNode };
type Section = { id: string; title: string; blurb: string; faqs: Faq[] };

function A({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="font-medium text-[var(--accent-text)] underline underline-offset-2 hover:no-underline"
    >
      {children}
    </Link>
  );
}

const POLICY_ROWS: { name: string; before: string; after: string }[] = [
  {
    name: 'flexible',
    before: 'Full refund of the space amount if you cancel more than 1 hour before the start.',
    after: 'Nothing is refunded inside the last hour.',
  },
  {
    name: 'moderate',
    before: 'Full refund of the space amount if you cancel more than 24 hours before the start.',
    after: 'Half the space amount is refunded inside 24 hours.',
  },
  {
    name: 'strict',
    before: 'Half the space amount is refunded if you cancel more than 48 hours before the start.',
    after: 'Nothing is refunded inside 48 hours.',
  },
  {
    name: 'non_refundable',
    before: 'Nothing is refunded once the booking is confirmed.',
    after: 'Nothing. This policy is offered on monthly and event inventory only.',
  },
];

const SECTIONS: Section[] = [
  {
    id: 'booking',
    title: 'Booking',
    blurb: 'Finding a space, holding it, and what a confirmed booking actually means.',
    faqs: [
      {
        q: 'How do I book a parking space?',
        a: (
          <>
            Enter where you are going and the times you need on the{' '}
            <A href="/search">search page</A>. Only spaces that are free for that entire
            window are shown. Open a listing, check the price, the walking distance and the
            cancellation policy, then reserve. You pay before the booking is confirmed, and
            the confirmation is what makes the bay yours.
          </>
        ),
      },
      {
        q: 'How long is a space held while I pay?',
        a: (
          <>
            10 minutes. The moment you start checkout, that specific bay is locked to you and
            nobody else can take it. If payment is not completed in those 10 minutes the hold
            expires and the bay returns to the market. That is long enough to finish paying
            and short enough that an abandoned browser tab never parks a space out of use.
          </>
        ),
      },
      {
        q: 'What does guaranteed actually mean?',
        a: (
          <>
            It means one named bay is reserved for your exact period, and the database itself
            refuses to store a second booking that overlaps it. Double booking is not made
            unlikely, it is made impossible to record. If a host cannot deliver a confirmed
            space, you receive a full refund including the service fee.
          </>
        ),
      },
      {
        q: 'What is the shortest and the longest booking?',
        a: (
          <>
            The minimum is 30 minutes and the maximum is 90 days. Hourly, daily, overnight and
            monthly rates all run on the same inventory, so a long stay is booked the same way
            as a short one.
          </>
        ),
      },
      {
        q: 'Can I change or extend a booking?',
        a: (
          <>
            You can extend from the booking screen if the bay is still free for the extra
            time, and you must do it before your end time. If the next period is already
            booked by someone else, it cannot be extended and you will need to leave. Staying
            on is not a way to extend, and it is charged as an overstay.
          </>
        ),
      },
      {
        q: 'Do I have to give my vehicle registration?',
        a: (
          <>
            Yes, and it needs to be the vehicle that will actually park. Hosts and guards use
            it to recognise you at the gate, and a booking made under a registration that does
            not turn up can be treated as a no-show. Add your vehicles once in your account and
            pick one at checkout.
          </>
        ),
      },
      {
        q: 'What happens if I arrive late?',
        a: (
          <>
            Nothing at all. The bay is yours for the whole period you booked, and the host must
            keep it free for you even if you never appear. What you cannot do is stay past your
            end time, because the next driver may already be on the way.
          </>
        ),
      },
    ],
  },
  {
    id: 'payments',
    title: 'Payments, fees and refunds',
    blurb: 'What you pay, what we keep, and how money comes back when it should.',
    faqs: [
      {
        q: 'What exactly am I charged?',
        a: (
          <>
            The price the host set, plus a ParkSpace service fee of 5% of that amount, plus tax
            on the fee. On a ₹300 booking that is ₹300 for the space, ₹15 service fee and ₹2.70
            of tax, so ₹317.70 in total. The whole breakdown is shown before you commit, never
            after.
          </>
        ),
      },
      {
        q: 'What does the host receive?',
        a: (
          <>
            ParkSpace keeps a host commission of 10% of the amount the host charged, so a ₹300
            booking pays the host ₹270. The service fee you pay is our charge to you and does
            not come out of the host share.
          </>
        ),
      },
      {
        q: 'When am I charged?',
        a: (
          <>
            At checkout, while the 10 minute hold is running. The booking is confirmed only
            once the payment provider confirms the payment. A confirmation screen shown before
            that verification is not a confirmation.
          </>
        ),
      },
      {
        q: 'Is the service fee refunded if I cancel?',
        a: (
          <>
            No. The service fee is retained when you cancel, whatever the cancellation policy
            says about the space amount. It is refunded in full when the host cancels, when
            ParkSpace cancels, or when the space turns out not to be usable.
          </>
        ),
      },
      {
        q: 'How long does a refund take to arrive?',
        a: (
          <>
            Once a refund is approved we start it within one business day. After that the
            timing is with the banks. As an indication, UPI usually takes 1 to 3 business days,
            net banking 3 to 7, and cards 5 to 7 and sometimes the next statement cycle.
            Refunds return only to the instrument you paid with and cannot be redirected to
            another card or account.
          </>
        ),
      },
      {
        q: 'Are my card details stored?',
        a: (
          <>
            No. Payments are processed by an authorised payment aggregator and ParkSpace never
            sees or stores your full card number. See the{' '}
            <A href="/legal/privacy">privacy policy</A> for what we do hold.
          </>
        ),
      },
      {
        q: 'What is wallet credit?',
        a: (
          <>
            Wallet credit, coupons and referral credit are a discount mechanism applied to a
            future booking. They are not money. They cannot be withdrawn, cannot be
            transferred to another person, and may expire. If you would rather have a refund
            back on your card than as credit, that choice is always yours.
          </>
        ),
      },
    ],
  },
  {
    id: 'access',
    title: 'Getting in, checking in and checking out',
    blurb: 'The address, the QR code, the grace period and what to do if something is wrong.',
    faqs: [
      {
        q: 'When do I get the exact address?',
        a: (
          <>
            24 hours before your booking starts, and not before. Until then you see an
            approximate point offset by 80 to 150 metres, plus the street and the locality. At
            the 24 hour mark the full address, the gate number and the host access instructions
            appear on your booking. The rule is enforced in the database, so nothing in the app
            can release it early.
          </>
        ),
      },
      {
        q: 'How do I get in when I arrive?',
        a: (
          <>
            Open your booking and scan the QR code at the gate, or use the check in control on
            the booking if there is no code to scan. Check in records the time and, only if you
            allow it, a single location reading to confirm you are at the space.
          </>
        ),
      },
      {
        q: 'The space is in a basement and my phone cannot get a location. Now what?',
        a: (
          <>
            Check in anyway. A failed location reading does not deny you the space, and the
            host can confirm your arrival instead. What you must not do is have someone else
            check in for you or use a tool that fakes a location, which is treated as fraud.
          </>
        ),
      },
      {
        q: 'Do I have to check out?',
        a: (
          <>
            Yes, please do it as you leave. Checking out closes the booking and releases the bay
            for whoever is next. Forgetting to check out can let an overstay charge build up
            against you and blocks the host from reletting the bay.
          </>
        ),
      },
      {
        q: 'What is the grace period?',
        a: (
          <>
            10 minutes after your end time. Check out inside that window and there is nothing
            extra to pay.
          </>
        ),
      },
      {
        q: 'What happens if I overstay?',
        a: (
          <>
            Past the 10 minute grace period an overstay charge accrues from your original end
            time, at 1.5 times the space hourly rate. It is calculated and collected by
            ParkSpace, and a host is not permitted to demand a charge of their own at the gate.
            If the bay is still free, extending before your end time is always cheaper. An
            overstay that blocks the next driver is a serious matter and can suspend your
            account.
          </>
        ),
      },
      {
        q: 'I arrived and the space is occupied or I cannot get in.',
        a: (
          <>
            Report it in the app from the location, with a photograph if it is safe to take
            one, before you leave. Reporting from the spot is what lets us resolve it in your
            favour. The host gets a short window, normally 15 minutes, to sort it out. If it is
            not resolved the booking is cancelled as a host failure and you are refunded in
            full, service fee included, and we will try to rebook you nearby.
          </>
        ),
      },
    ],
  },
  {
    id: 'cancellations',
    title: 'Cancellations and no-shows',
    blurb: 'The four policies in full, and what happens when the other side cancels.',
    faqs: [
      {
        q: 'How do the four cancellation policies work?',
        a: (
          <>
            <p>
              Every space carries one policy, and it is shown on the listing, at checkout and on
              your confirmation. The amounts below are about the space amount. The 5% service
              fee is retained on any driver cancellation.
            </p>
            <div className="mt-4 overflow-x-auto rounded-xl border">
              <table className="w-full min-w-[34rem] border-collapse text-sm">
                <thead className="bg-[var(--surface-sunken)]">
                  <tr>
                    <th scope="col" className="px-3 py-2 text-left font-semibold">Policy</th>
                    <th scope="col" className="px-3 py-2 text-left font-semibold">Before the cutoff</th>
                    <th scope="col" className="px-3 py-2 text-left font-semibold">After the cutoff</th>
                  </tr>
                </thead>
                <tbody>
                  {POLICY_ROWS.map((row) => (
                    <tr key={row.name} className="border-t">
                      <td className="px-3 py-2 align-top font-mono text-xs font-semibold">
                        {row.name}
                      </td>
                      <td className="px-3 py-2 align-top">{row.before}</td>
                      <td className="px-3 py-2 align-top">{row.after}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ),
      },
      {
        q: 'Why does flexible refund nothing in the last hour?',
        a: (
          <>
            Because that is the point at which the host can no longer resell the bay. Flexible
            is the most generous policy before its cutoff and the strictest after it, on
            purpose. A space released an hour before the stay can still find another driver.
            One released ten minutes before cannot.
          </>
        ),
      },
      {
        q: 'How do I cancel?',
        a: (
          <>
            Open the booking and choose cancel. Before you confirm, the screen shows exactly
            what comes back to you under that space policy, so there is no arithmetic to do and
            no surprise afterwards.
          </>
        ),
      },
      {
        q: 'What if the host cancels on me?',
        a: (
          <>
            You are refunded in full, the service fee included, and we will try to find you
            another space nearby. A host cancellation also carries a reliability penalty for
            that host, and a pattern of them leads to delisting.
          </>
        ),
      },
      {
        q: 'What if I never turn up?',
        a: (
          <>
            The booking is marked as a no-show and treated as though you cancelled at the start
            time. In practice that means flexible refunds nothing, because its one hour window
            has closed, moderate refunds half, strict refunds nothing and non refundable
            refunds nothing. The host must still keep the bay free for the whole period, because
            a driver may simply be very late.
          </>
        ),
      },
      {
        q: 'Can ParkSpace cancel a booking?',
        a: (
          <>
            Rarely, and when we do it is because a listing has been suspended, a payment has
            failed verification, or there is a safety or fraud concern. In every case you are
            refunded in full including the service fee.
          </>
        ),
      },
      {
        q: 'I disagree with what I was refunded.',
        a: (
          <>
            Raise a dispute on the booking within the window shown on it, and attach whatever
            evidence you have. Disputes are read by a person, both sides are asked, and the
            decision is recorded on the booking. The full ladder is set out in the{' '}
            <A href="/legal/refunds">refund policy</A>, and there is a{' '}
            <A href="/legal/grievance">grievance officer</A> above that.
          </>
        ),
      },
    ],
  },
  {
    id: 'hosting',
    title: 'Hosting',
    blurb: 'Listing a space, getting paid, and what is expected of you.',
    faqs: [
      {
        q: 'What does it cost to list a space?',
        a: (
          <>
            Nothing to list, and nothing monthly. ParkSpace keeps a host commission of 10% of
            the amount you charge, so a ₹300 booking pays you ₹270. If a space is never booked,
            it never costs you anything. Start at{' '}
            <A href="/list-your-space">list your space</A>.
          </>
        ),
      },
      {
        q: 'When do I get paid?',
        a: (
          <>
            The payout for a stay is queued once the booking completes and is sent to the
            payout method registered in your own legal name. The exact settlement window
            depends on our payment provider and is stated in the{' '}
            <A href="/legal/host-terms">host agreement</A>. New host accounts can carry a short
            holdback as a fraud control, and a payout can be delayed while a dispute on that
            booking is open.
          </>
        ),
      },
      {
        q: 'Do I need permission from my housing society?',
        a: (
          <>
            If the bay is inside a society, a gated complex or a managed building, yes. The
            bye-laws may cover who can enter, who may use an allotted bay and whether common
            areas can be used commercially. Ask the managing committee first and keep their
            answer in writing. Commercial parking can carry its own condition that it be
            reserved for that establishment and its patrons. Details are on the{' '}
            <A href="/list-your-space">host page</A>.
          </>
        ),
      },
      {
        q: 'Who decides the price?',
        a: (
          <>
            You do. Set an hourly, daily, overnight or monthly rate and change it whenever you
            like. A price change never affects a booking that is already confirmed. We show you
            what comparable spaces nearby are charging so the first number is not a guess.
          </>
        ),
      },
      {
        q: 'Can I block dates I need the space myself?',
        a: (
          <>
            Yes. Availability is entirely yours to set, by hour, by day or by date range, and
            you can close the calendar at any time. Nobody can book outside the windows you have
            opened. What you cannot do is take back a period someone has already booked without
            cancelling, which carries a reliability penalty.
          </>
        ),
      },
      {
        q: 'What if I have to cancel on a driver?',
        a: (
          <>
            Do it as early as you can, from the booking screen, and say why. The driver is
            refunded in full including the service fee, and a reliability penalty is applied to
            your account. Repeated host cancellations lead to delisting, because an unreliable
            space is worse for drivers than no space at all.
          </>
        ),
      },
      {
        q: 'A driver overstayed or left damage. What happens?',
        a: (
          <>
            Overstay is handled for you. The charge is calculated at 1.5 times your hourly rate
            from the original end time and collected through ParkSpace, and it is split on the
            same commission basis as the booking. Never demand payment at the gate. For damage,
            raise a dispute on the booking with photographs as soon as you find it. ParkSpace is
            not an insurer and does not underwrite loss, so your own property cover still
            matters.
          </>
        ),
      },
    ],
  },
  {
    id: 'safety',
    title: 'Safety and trust',
    blurb: 'Verification, privacy at the address level, and what we are not.',
    faqs: [
      {
        q: 'Who can see my address as a host?',
        a: (
          <>
            Only a driver holding a confirmed booking on your space, and only from 24 hours
            before that booking starts. Everyone else sees a point offset by 80 to 150 metres
            with the street and the locality. Row level security in the database enforces it,
            not a rule in the interface.
          </>
        ),
      },
      {
        q: 'Are hosts and drivers verified?',
        a: (
          <>
            Accounts are verified with a government photo ID, and host listings are reviewed
            before they go live. Verification is a fraud control and a trust signal. It is not a
            legal opinion on a host right to let the space, which stays the host responsibility.
          </>
        ),
      },
      {
        q: 'Is my car insured while it is parked?',
        a: (
          <>
            No. ParkSpace is a booking platform, not an insurer, not a car park operator and not
            a custodian of your vehicle. Your own motor policy is what covers the car, and a
            host property cover is what covers their property. We say this plainly rather than
            leave it to be discovered later.
          </>
        ),
      },
      {
        q: 'Do you track my location?',
        a: (
          <>
            No. One reading at check in and one at check out, each only with your permission and
            each a single sample. There is no background location, no journey history and no
            sale of personal data to anybody. The{' '}
            <A href="/legal/privacy">privacy policy</A> sets out everything we hold.
          </>
        ),
      },
      {
        q: 'How do I report a listing, a driver or a host?',
        a: (
          <>
            Every listing and every booking has a report control. Tell us what happened and
            attach anything you have. Reports are read by a person, and a space or an account
            can be suspended while we look. If you are in immediate danger, contact the local
            authorities first and us afterwards.
          </>
        ),
      },
      {
        q: 'What are the rules of conduct?',
        a: (
          <>
            Short version: park only in the bay you booked, leave it as you found it, follow the
            host instructions and the building rules, and treat the guard at the gate as you
            would want to be treated. The full version is in the{' '}
            <A href="/legal/guidelines">community guidelines</A>.
          </>
        ),
      },
    ],
  },
  {
    id: 'account',
    title: 'Your account',
    blurb: 'Signing in, switching roles, and leaving.',
    faqs: [
      {
        q: 'How do I sign in?',
        a: (
          <>
            With your email address, using either a one time code sent to you or a password you
            set. You need a verified email to book or to host, and a verified phone number
            before a host listing goes live.
          </>
        ),
      },
      {
        q: 'Can I be a driver and a host on the same account?',
        a: (
          <>
            Yes. One account can hold both roles, and you switch between the driver view and the
            host dashboard from the account menu. Your booking history and your hosting history
            stay separate.
          </>
        ),
      },
      {
        q: 'How do I change my email, phone or payout details?',
        a: (
          <>
            From your account settings. A change of email or phone needs the new address or
            number verified before it takes effect, and payout details must stay in your own
            legal name.
          </>
        ),
      },
      {
        q: 'How do I delete my account?',
        a: (
          <>
            Ask from your account settings. We close the account and delete what we are free to
            delete. Some records have to be kept for a period for tax, accounting, fraud and
            legal reasons, and those are listed with their retention periods in the{' '}
            <A href="/legal/privacy">privacy policy</A>. An account with an active booking, an
            open dispute or an unsettled amount cannot be closed until those are finished.
          </>
        ),
      },
      {
        q: 'How do I get a copy of my data?',
        a: (
          <>
            Request it from your account settings and we return it in a machine readable format.
            The privacy policy explains what is included and how long the request takes.
          </>
        ),
      },
    ],
  },
];

export default function HelpPage() {
  const total = SECTIONS.reduce((sum, section) => sum + section.faqs.length, 0);

  return (
    <>
      <SiteHeader />

      <main id="main">
        <section className="border-b bg-[var(--surface-sunken)]">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
            <Badge tone="accent">Help centre</Badge>
            <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
              How can we help?
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--text-muted)]">
              {total} answers across seven sections, written against how the product actually
              behaves. If something here does not match what you are seeing, tell us, because
              one of the two is wrong.
            </p>
          </div>
        </section>

        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-10 sm:px-6 sm:py-14 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-14">
          {/* Section index */}
          <nav aria-label="Help sections" className="min-w-0 lg:sticky lg:top-24 lg:self-start">
            <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
              Sections
            </p>
            <ul className="mt-3 flex gap-2 overflow-x-auto pb-2 lg:mt-4 lg:flex-col lg:gap-1 lg:overflow-visible lg:pb-0">
              {SECTIONS.map((section) => (
                <li key={section.id} className="shrink-0">
                  <a
                    href={`#${section.id}`}
                    className="block whitespace-nowrap rounded-lg border px-3 py-2 text-sm font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text)] lg:border-transparent"
                  >
                    {section.title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="min-w-0">
            {SECTIONS.map((section) => (
              <section key={section.id} id={section.id} className="mb-14 scroll-mt-24">
                <h2 className="text-2xl font-bold tracking-tight">{section.title}</h2>
                <p className="mt-2 text-[var(--text-muted)]">{section.blurb}</p>

                <div className="mt-6 divide-y rounded-xl border">
                  {section.faqs.map((faq) => (
                    <details key={faq.q} className="group px-4 py-1 [&_summary]:list-none">
                      <summary className="flex cursor-pointer items-start gap-3 py-4 text-left font-semibold">
                        <span
                          aria-hidden="true"
                          className="mt-0.5 shrink-0 text-[var(--text-muted)] transition-transform group-open:rotate-90"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M9 18l6-6-6-6" />
                          </svg>
                        </span>
                        <span className="min-w-0">{faq.q}</span>
                      </summary>
                      <div className="min-w-0 pb-4 pl-7 text-sm leading-7 text-[var(--text-muted)]">
                        {faq.a}
                      </div>
                    </details>
                  ))}
                </div>
              </section>
            ))}

            <Alert tone="info" title="Still stuck?" className="mb-10">
              Raise it from the booking or the listing it concerns, because that attaches the
              record we need to resolve it. For anything formal, the{' '}
              <A href="/legal/grievance">grievance officer</A> is the escalation point, and the{' '}
              <A href="/legal/refunds">refund policy</A> sets out the full ladder.
            </Alert>

            <Card className="flex flex-col items-start gap-5 p-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-bold tracking-tight">Looking for the detail?</h2>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  The terms, the refund rules and the privacy policy are all published in full.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link href="/legal/terms" className="ps-btn ps-btn-secondary">
                  Read the terms
                </Link>
                <Link href="/how-it-works" className="ps-btn ps-btn-ghost">
                  How it works
                </Link>
              </div>
            </Card>
          </div>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
