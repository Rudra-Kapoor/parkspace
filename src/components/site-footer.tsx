import Link from 'next/link';
import { Logo } from './ui';

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t bg-[var(--surface-sunken)]">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <div className="grid gap-10 md:grid-cols-4">
          <div>
            <Logo />
            <p className="mt-3 max-w-xs text-sm text-[var(--text-muted)]">
              Reserve a guaranteed parking space before you set off. Or let your empty
              driveway earn while you are at work.
            </p>
          </div>

          <FooterColumn title="Drivers">
            <FooterLink href="/search">Find parking</FooterLink>
            <FooterLink href="/how-it-works">How it works</FooterLink>
            <FooterLink href="/bookings">My bookings</FooterLink>
            <FooterLink href="/help">Help centre</FooterLink>
          </FooterColumn>

          <FooterColumn title="Hosts">
            <FooterLink href="/list-your-space">List your space</FooterLink>
            <FooterLink href="/host">Host dashboard</FooterLink>
            <FooterLink href="/help#hosting">Hosting guide</FooterLink>
          </FooterColumn>

          <FooterColumn title="Legal">
            <FooterLink href="/legal/terms">Terms of service</FooterLink>
            <FooterLink href="/legal/privacy">Privacy policy</FooterLink>
            <FooterLink href="/legal/refunds">Cancellation and refunds</FooterLink>
            <FooterLink href="/legal/host-terms">Host agreement</FooterLink>
            <FooterLink href="/legal/grievance">Grievance officer</FooterLink>
          </FooterColumn>
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t pt-6 text-xs text-[var(--text-muted)] sm:flex-row sm:items-center sm:justify-between">
          <p>ParkSpace. Built as a demonstration product.</p>
          <p>
            Map data from{' '}
            <a
              href="https://www.openstreetmap.org/copyright"
              className="underline hover:text-[var(--text)]"
              rel="noopener noreferrer"
              target="_blank"
            >
              OpenStreetMap contributors
            </a>
            .
          </p>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
        {title}
      </h2>
      <ul className="mt-3 space-y-2">{children}</ul>
    </div>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <Link href={href} className="text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text)]">
        {children}
      </Link>
    </li>
  );
}
