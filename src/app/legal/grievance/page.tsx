import type { Metadata } from 'next';
import Link from 'next/link';
import { Alert, Badge, Card } from '@/components/ui';

export const metadata: Metadata = {
  title: 'Grievance officer',
  description:
    'How to escalate a complaint about ParkSpace, who the grievance officer is, and the 30 day ' +
    'commitment to resolve. An unreviewed draft.',
  alternates: { canonical: '/legal/grievance' },
  robots: { index: false, follow: true },
};

const LADDER: { title: string; body: string; note: string }[] = [
  {
    title: 'Raise it on the booking',
    body: 'Almost everything is fastest here, because the booking already holds the times, the payment, the check in record and the messages. Open the booking or the listing it concerns and use the report control.',
    note: 'Normally answered within 2 business days',
  },
  {
    title: 'Open a dispute',
    body: 'If the answer does not settle it, open a dispute on the same booking and attach your evidence. Both sides are asked for their account, a person reads it, and the decision and the reasons are recorded on the booking.',
    note: 'Windows and timelines are set out in the refund policy',
  },
  {
    title: 'Write to the grievance officer',
    body: 'If the dispute outcome is still wrong, or your complaint is about how we handled it rather than about the booking itself, write to the officer named below. Quote your booking reference and say what outcome you are asking for.',
    note: 'Acknowledged within 48 hours, resolved within 30 days',
  },
  {
    title: 'Go outside ParkSpace',
    body: 'Nothing on this page takes away any right you have to approach a consumer forum, a data protection authority or any other body with jurisdiction. You do not have to exhaust the steps above first, although doing so usually gets you an answer sooner.',
    note: 'Your statutory rights are unaffected',
  },
];

export default function GrievancePage() {
  return (
    <>
      <header>
        <Badge tone="accent">Legal</Badge>
        <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Grievance officer</h1>
        <p className="mt-3 text-[var(--text-muted)]">
          If something has gone wrong and the ordinary route has not fixed it, this is the
          escalation point. Complaints about a booking, about a refund, about how your personal
          data has been handled, or about conduct on the platform all end up here.
        </p>
      </header>

      <Alert tone="warning" title="Unreviewed draft. Do not rely on this document." className="mt-6">
        This text has not been settled by a lawyer and has not been reviewed by a chartered
        accountant. It is not legal advice, it binds nobody, and no part of it should be relied
        upon. The officer details below are placeholders. A real appointment, and the statutory
        response times that actually apply, must be settled by qualified counsel before this page
        goes anywhere near a real user.
      </Alert>

      {/* Contact block */}
      <Card className="mt-10 p-6 sm:p-8">
        <h2 className="text-xl font-bold tracking-tight">Contact details</h2>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Every field marked as a placeholder is unfilled on purpose, because appointing a
          grievance officer is a real legal step and inventing a name here would be worse than
          leaving it blank.
        </p>

        <dl className="mt-6 space-y-5 text-sm">
          <Field label="Name">[PLACEHOLDER: GRIEVANCE OFFICER NAME]</Field>
          <Field label="Designation">[PLACEHOLDER: DESIGNATION]</Field>
          <Field label="Email">[PLACEHOLDER: GRIEVANCE OFFICER EMAIL]</Field>
          <Field label="Telephone">[PLACEHOLDER: TELEPHONE NUMBER]</Field>
          <Field label="Postal address">
            [PLACEHOLDER: COMPANY LEGAL NAME]
            <br />
            [PLACEHOLDER: BUILDING AND STREET]
            <br />
            [PLACEHOLDER: CITY, STATE, PIN CODE]
            <br />
            India
          </Field>
          <Field label="Working hours">[PLACEHOLDER: DAYS AND HOURS]</Field>
        </dl>
      </Card>

      <div className="mt-10 space-y-12">
        <section>
          <h2 className="text-2xl font-bold tracking-tight">What we commit to</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <Commitment value="48 hours" label="To acknowledge" body="You get a written acknowledgement with a reference number." />
            <Commitment value="30 days" label="To resolve" body="A reasoned decision in writing, from the date the complaint reaches the officer." />
            <Commitment value="Always" label="In writing" body="The outcome and the reasons for it, so you have something you can take further." />
          </div>
          <p className="mt-5 leading-7 text-[var(--text-muted)]">
            The 30 day commitment runs from the day the grievance officer receives your complaint,
            not from the day the original problem happened. If we need something from you to make
            progress we will ask once and clearly, and the clock keeps running while we wait. If a
            complaint is genuinely complex and 30 days will not be enough, we will tell you before
            the deadline, explain why, and give you a date.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-bold tracking-tight">What to send</h2>
          <ul className="mt-4 space-y-3 text-sm leading-7 text-[var(--text-muted)]">
            <li>Your booking reference, if the complaint concerns a booking.</li>
            <li>The email address on your ParkSpace account, so we can find you.</li>
            <li>What happened, in the order it happened, with dates and times.</li>
            <li>What you have already tried, including any dispute reference you have.</li>
            <li>Any photographs, screenshots or messages that support it.</li>
            <li>What outcome you are asking for.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-bold tracking-tight">The escalation path</h2>
          <p className="mt-3 leading-7 text-[var(--text-muted)]">
            Four steps, in order. Each one exists because it can usually settle things faster than
            the next one.
          </p>
          <ol className="mt-6 space-y-5">
            {LADDER.map((step, index) => (
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
                  <p className="ps-hint mt-1">{step.note}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section>
          <h2 className="text-2xl font-bold tracking-tight">Complaints about your personal data</h2>
          <p className="mt-3 leading-7 text-[var(--text-muted)]">
            A request to see, correct or delete your data, or a complaint about how it has been
            handled, can go straight to the grievance officer without going through the earlier
            steps. What we hold, why we hold it and how long we keep it is set out in the{' '}
            <Link href="/legal/privacy" className="font-medium text-[var(--accent-text)] underline underline-offset-2">
              privacy policy
            </Link>
            . Which authority you can escalate to beyond us, and within what time, depends on rules
            that are still being notified, and this page will name that authority once it can do so
            accurately.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-bold tracking-tight">Related pages</h2>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/legal/refunds" className="ps-btn ps-btn-secondary">
              Cancellation and refunds
            </Link>
            <Link href="/legal/guidelines" className="ps-btn ps-btn-secondary">
              Community guidelines
            </Link>
            <Link href="/help" className="ps-btn ps-btn-ghost">
              Help centre
            </Link>
          </div>
        </section>
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="sm:flex sm:gap-6">
      <dt className="w-40 shrink-0 font-semibold">{label}</dt>
      <dd className="mt-1 min-w-0 break-words font-mono text-[0.8125rem] text-[var(--text-muted)] sm:mt-0">
        {children}
      </dd>
    </div>
  );
}

function Commitment({ value, label, body }: { value: string; label: string; body: string }) {
  return (
    <div className="rounded-xl border bg-[var(--surface-sunken)] p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </p>
      <p className="mt-1 text-xl font-bold text-[var(--accent-text)]">{value}</p>
      <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">{body}</p>
    </div>
  );
}
