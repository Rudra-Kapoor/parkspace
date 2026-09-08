import type { Metadata } from 'next';
import Link from 'next/link';
import { Alert, Badge, Card } from '@/components/ui';

export const metadata: Metadata = {
  title: 'Community guidelines',
  description:
    'The rules that keep ParkSpace worth using, for drivers and for hosts, and what happens ' +
    'when they are broken. An unreviewed draft.',
  alternates: { canonical: '/legal/guidelines' },
  robots: { index: false, follow: true },
};

const SHARED: { title: string; body: string }[] = [
  {
    title: 'Say what is true',
    body: 'An accurate listing, an accurate vehicle, an accurate report of what happened. Almost every dispute on a marketplace like this begins with something that was described a little better than it was.',
  },
  {
    title: 'Keep to the time you agreed',
    body: 'A booking is a promise about a period, on both sides. The bay is held for the driver for the whole window, and the driver leaves at the end of it.',
  },
  {
    title: 'Keep it on ParkSpace',
    body: 'Messages, payments and changes go through the platform. It is not about control, it is that a booking with no record is a booking nobody can help you with when it goes wrong.',
  },
  {
    title: 'Treat people decently',
    body: 'That includes the guard at the gate, the neighbour whose car is next to yours and the person on the other end of a message at eleven at night. Harassment, threats and abuse end an account.',
  },
  {
    title: 'No discrimination',
    body: 'Nobody is refused a space, or refused as a guest, because of religion, caste, gender, disability, sexual orientation, language, region or anything else of that kind.',
  },
  {
    title: 'Respect privacy',
    body: 'A host address, a driver number plate and anything either of you learns through a booking is for that booking. Do not publish it, share it or use it for anything else.',
  },
];

const DRIVER_RULES: string[] = [
  'Park in the bay you booked, not the one that looks easier. A neighbouring bay almost always belongs to somebody.',
  'Follow the access instructions and the building rules. If the guard asks for your booking, show it.',
  'Register the vehicle that will actually park, with the correct number plate. Hosts and guards use it to recognise you.',
  'Check in when you arrive and check out when you leave. It takes two seconds and it is what releases the bay for the next person.',
  'Never fake a location reading and never ask someone else to check in for you. That is fraud and it ends the account.',
  'Leave the space as you found it. No rubbish, no oil patch you could have mentioned, no blocked access.',
  'Do not pass your booking to someone else, and do not relet a monthly space you booked.',
  'If something is wrong, report it from the location before you leave, with a photograph if it is safe to take one.',
  'Leave by your end time, or extend in the app before it if the bay is still free. The 10 minute grace period is for traffic, not for a second meeting.',
];

const HOST_RULES: string[] = [
  'List only a space you genuinely have the right to let, and take it down if that ever stops being true.',
  'Keep the listing honest. Real photographs of the actual bay, real dimensions, real amenities, and a realistic walking time.',
  'Keep the calendar honest. If the space is not free, close it rather than hoping nobody books.',
  'Make the space usable, not merely present. A bay behind a locked gate nobody can open is an unusable bay.',
  'Keep access instructions current. Gate codes change, guards change, and a driver standing outside at midnight has no way to know.',
  'Honour the booking even when the driver is late. They may still arrive, and the bay is theirs until the end time.',
  'Cancel only in a genuine emergency. A cancellation strands somebody who had made a plan around it.',
  'Never take payment at the gate and never levy your own overstay charge. All money runs through ParkSpace.',
  'Do not ask a driver for personal documents or information beyond what the booking already gives you.',
  'Report damage or misuse through the booking, with photographs, rather than confronting someone in a driveway.',
];

const CONSEQUENCES: { step: string; body: string }[] = [
  {
    step: 'A word about it',
    body: 'Most breaches are careless rather than deliberate. The first response is usually a note explaining what went wrong and what to do differently.',
  },
  {
    step: 'A listing paused or a feature limited',
    body: 'A space with a repeated problem is taken off search while it is sorted out. An account may lose instant booking or lose the ability to list.',
  },
  {
    step: 'Suspension',
    body: 'Serious or repeated breaches suspend the account. Bookings already confirmed are cancelled, and where the fault is on the host side the driver is refunded in full.',
  },
  {
    step: 'Permanent removal',
    body: 'Fraud, faked check ins, listing a space you have no right to let, threats or violence end the account permanently, and we will cooperate with the authorities where the law requires it.',
  },
];

export default function GuidelinesPage() {
  return (
    <>
      <header>
        <Badge tone="accent">Legal</Badge>
        <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
          Community guidelines
        </h1>
        <p className="mt-3 text-[var(--text-muted)]">
          A parking marketplace runs on a small number of people keeping small promises. These
          are the rules that make the promises hold, written for both sides of the gate.
        </p>
      </header>

      <Alert tone="warning" title="Unreviewed draft. Do not rely on this document." className="mt-6">
        This text has not been settled by a lawyer and has not been reviewed by a chartered
        accountant. It is not legal advice, it binds nobody, and no part of it should be relied
        upon. Where it differs from the{' '}
        <Link href="/legal/host-terms" className="font-medium text-[var(--accent-text)] underline underline-offset-2">
          host agreement
        </Link>{' '}
        or the{' '}
        <Link href="/legal/driver-terms" className="font-medium text-[var(--accent-text)] underline underline-offset-2">
          driver agreement
        </Link>
        , those documents are the ones that matter.
      </Alert>

      <div className="mt-10 space-y-12">
        <section>
          <h2 className="text-2xl font-bold tracking-tight">Six rules for everybody</h2>
          <ul className="mt-5 grid gap-4 sm:grid-cols-2">
            {SHARED.map((rule) => (
              <Card as="li" key={rule.title} className="p-5">
                <h3 className="text-sm font-semibold">{rule.title}</h3>
                <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{rule.body}</p>
              </Card>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-bold tracking-tight">If you are parking</h2>
          <p className="mt-3 leading-7 text-[var(--text-muted)]">
            You are a guest on somebody property, often at their home. Behave the way you would
            want a stranger to behave in your own driveway.
          </p>
          <ul className="mt-5 space-y-3">
            {DRIVER_RULES.map((rule) => (
              <li key={rule} className="flex gap-3 text-sm leading-7">
                <Tick />
                <span className="min-w-0 text-[var(--text-muted)]">{rule}</span>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-bold tracking-tight">If you are hosting</h2>
          <p className="mt-3 leading-7 text-[var(--text-muted)]">
            Somebody has planned a journey around your space and paid for it before setting off.
            Everything below follows from that one fact.
          </p>
          <ul className="mt-5 space-y-3">
            {HOST_RULES.map((rule) => (
              <li key={rule} className="flex gap-3 text-sm leading-7">
                <Tick />
                <span className="min-w-0 text-[var(--text-muted)]">{rule}</span>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-bold tracking-tight">Messages and reviews</h2>
          <p className="mt-3 leading-7 text-[var(--text-muted)]">
            Messaging exists so a driver can find the gate and a host can say the lift is out.
            It is not a place for sales pitches, for asking someone to pay outside the platform,
            or for pressure of any kind. Reviews are for describing the stay that actually
            happened. Both sides write one, neither is published until both are in or the window
            closes, and a review may not be traded, bought or used as a threat.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-bold tracking-tight">Reporting something</h2>
          <p className="mt-3 leading-7 text-[var(--text-muted)]">
            Every listing and every booking carries a report control. Use it while the evidence
            is still in front of you, and attach photographs where you safely can. Reports are
            read by a person and a space or an account can be paused while we look into it. If
            anyone is in immediate danger, contact the local authorities first and us afterwards.
            Anything you cannot resolve this way goes to the{' '}
            <Link href="/legal/grievance" className="font-medium text-[var(--accent-text)] underline underline-offset-2">
              grievance officer
            </Link>
            .
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-bold tracking-tight">What happens when a rule is broken</h2>
          <p className="mt-3 leading-7 text-[var(--text-muted)]">
            Four steps, applied in proportion to what happened and to whether it has happened
            before.
          </p>
          <ol className="mt-6 space-y-5">
            {CONSEQUENCES.map((item, index) => (
              <li key={item.step} className="flex gap-4">
                <span
                  aria-hidden="true"
                  className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-sm font-bold text-[var(--accent-text)]"
                >
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <h3 className="font-semibold">{item.step}</h3>
                  <p className="mt-1 text-sm leading-7 text-[var(--text-muted)]">{item.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </>
  );
}

function Tick() {
  return (
    <span aria-hidden="true" className="mt-2 shrink-0 text-[var(--accent-text)]">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 12l6 6L20 6" />
      </svg>
    </span>
  );
}
