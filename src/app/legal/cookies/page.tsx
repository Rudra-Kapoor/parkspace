import type { Metadata } from 'next';
import Link from 'next/link';
import { Alert, Badge, Card } from '@/components/ui';

export const metadata: Metadata = {
  title: 'Cookies and storage',
  description:
    'ParkSpace uses one session cookie to keep you signed in and browser storage for interface ' +
    'preferences. There is no third party advertising tracking. An unreviewed draft.',
  alternates: { canonical: '/legal/cookies' },
  robots: { index: false, follow: true },
};

const COOKIES: { name: string; purpose: string; life: string }[] = [
  {
    name: 'Session cookie',
    purpose:
      'Keeps you signed in between page loads and proves to the server that a request is really yours. Set when you sign in, cleared when you sign out.',
    life: 'Until you sign out, or until the session expires',
  },
  {
    name: 'Session refresh',
    purpose:
      'Renews the session quietly so you are not signed out in the middle of a booking. It carries no profile information of its own.',
    life: 'Same lifetime as the session cookie',
  },
];

const LOCAL_STORAGE: { name: string; purpose: string }[] = [
  {
    name: 'Theme choice',
    purpose: 'Whether you picked light or dark, so the page does not flash the wrong one on the next visit.',
  },
  {
    name: 'Map position',
    purpose: 'The last area and zoom level you looked at, so search opens where you left it.',
  },
  {
    name: 'Recent searches',
    purpose: 'The last few destinations and times you searched for, to save retyping them.',
  },
  {
    name: 'Dismissed notices',
    purpose: 'Which one time hints and banners you have closed, so they stay closed.',
  },
  {
    name: 'Unfinished forms',
    purpose: 'A draft of a long form such as the listing wizard, so a refresh does not lose your work.',
  },
];

export default function CookiesPage() {
  return (
    <>
      <header>
        <Badge tone="accent">Legal</Badge>
        <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Cookies and storage</h1>
        <p className="mt-3 text-[var(--text-muted)]">
          The short version. ParkSpace sets one session cookie so you stay signed in, and keeps
          a few interface preferences in your own browser. There is no advertising tracking of
          any kind, and nothing here is sold or shared with a data broker.
        </p>
      </header>

      <Alert tone="warning" title="Unreviewed draft. Do not rely on this document." className="mt-6">
        This text has not been settled by a lawyer and has not been reviewed by a chartered
        accountant. It is not legal advice, it binds nobody, and no part of it should be relied
        upon. Whether a consent mechanism is required for the storage described here, and in
        what form, is an open question for qualified counsel.
      </Alert>

      <div className="mt-10 space-y-10">
        <section>
          <h2 className="text-2xl font-bold tracking-tight">Cookies we set</h2>
          <p className="mt-3 leading-7 text-[var(--text-muted)]">
            Two, and both are strictly necessary. Without them you could sign in and then be
            treated as a stranger on the very next page, which would make booking impossible.
          </p>

          <div className="mt-5 overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[34rem] border-collapse text-sm">
              <thead className="bg-[var(--surface-sunken)]">
                <tr>
                  <th scope="col" className="px-3 py-2 text-left font-semibold">What it is</th>
                  <th scope="col" className="px-3 py-2 text-left font-semibold">Why it exists</th>
                  <th scope="col" className="px-3 py-2 text-left font-semibold">How long it lasts</th>
                </tr>
              </thead>
              <tbody>
                {COOKIES.map((cookie) => (
                  <tr key={cookie.name} className="border-t">
                    <td className="px-3 py-2 align-top font-semibold">{cookie.name}</td>
                    <td className="px-3 py-2 align-top text-[var(--text-muted)]">{cookie.purpose}</td>
                    <td className="px-3 py-2 align-top text-[var(--text-muted)]">{cookie.life}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-4 leading-7 text-[var(--text-muted)]">
            The session cookie is issued by our authentication provider. It is marked as HTTP
            only, so scripts on the page cannot read it, and it is sent only over an encrypted
            connection.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-bold tracking-tight">What is kept in your browser</h2>
          <p className="mt-3 leading-7 text-[var(--text-muted)]">
            Interface preferences are stored in your browser local storage, which is not a
            cookie and is never sent to our servers with a request. It exists so the app
            remembers small things about how you like to use it. Clearing your browser data
            clears all of it, and nothing is lost that matters.
          </p>

          <ul className="mt-5 grid gap-4 sm:grid-cols-2">
            {LOCAL_STORAGE.map((item) => (
              <Card as="li" key={item.name} className="p-4">
                <h3 className="text-sm font-semibold">{item.name}</h3>
                <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">{item.purpose}</p>
              </Card>
            ))}
          </ul>

          <p className="mt-5 leading-7 text-[var(--text-muted)]">
            Local storage is used for preferences only. Your bookings, your vehicles, your
            payment records and your messages live in your account on the server, not in the
            browser.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-bold tracking-tight">What we do not do</h2>
          <ul className="mt-4 space-y-3 leading-7 text-[var(--text-muted)]">
            <li className="flex gap-3">
              <Dash />
              <span>
                No advertising cookies, no retargeting pixels, no cross site trackers, and no
                social network embeds that watch you read the page.
              </span>
            </li>
            <li className="flex gap-3">
              <Dash />
              <span>
                No selling or sharing of anything stored here with a data broker or an
                advertiser.
              </span>
            </li>
            <li className="flex gap-3">
              <Dash />
              <span>
                No building of a browsing profile across other sites. ParkSpace knows what you
                did on ParkSpace, and nothing else.
              </span>
            </li>
            <li className="flex gap-3">
              <Dash />
              <span>
                No background location. The only location readings we take are the single ones
                at check in and check out, each with your permission, and those are described in
                the{' '}
                <Link href="/legal/privacy" className="font-medium text-[var(--accent-text)] underline underline-offset-2">
                  privacy policy
                </Link>
                .
              </span>
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-bold tracking-tight">Third parties you will meet anyway</h2>
          <p className="mt-3 leading-7 text-[var(--text-muted)]">
            Two parts of the product load from somewhere else, and honesty is better than a
            silent omission.
          </p>
          <ul className="mt-4 space-y-3 leading-7 text-[var(--text-muted)]">
            <li className="flex gap-3">
              <Dash />
              <span>
                Map tiles come from OpenStreetMap. Loading a map means your browser requests
                image tiles from their servers, which sees your IP address in the ordinary way
                any web request does.
              </span>
            </li>
            <li className="flex gap-3">
              <Dash />
              <span>
                Payment is handled by a licensed payment aggregator on its own pages or frames.
                It sets its own cookies under its own policy, which is what lets it detect
                fraud. We never see your full card number.
              </span>
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-bold tracking-tight">Controlling all of this</h2>
          <p className="mt-3 leading-7 text-[var(--text-muted)]">
            Your browser settings can block or clear cookies and site data for ParkSpace at any
            time. Clearing them signs you out and resets your preferences to their defaults.
            Blocking the session cookie entirely means you can still browse and search, but you
            will not be able to sign in, and so not be able to book or to host.
          </p>
          <p className="mt-4 leading-7 text-[var(--text-muted)]">
            Because nothing here is used for advertising or profiling, there is no consent
            banner to click through. If that position changes, this page changes with it and we
            will say so.
          </p>
        </section>
      </div>
    </>
  );
}

function Dash() {
  return (
    <span aria-hidden="true" className="mt-3 h-px w-3 shrink-0 bg-[var(--text-muted)]" />
  );
}
