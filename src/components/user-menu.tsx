'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { formatPaise } from '@/lib/money';
import { cn } from './ui';

/**
 * Account menu.
 *
 * Implemented as a real disclosure rather than a hover menu: it closes on Escape,
 * closes on outside click, restores focus to the trigger, and is reachable by
 * keyboard. Hover menus are unusable on touch and hostile to keyboard users, and
 * this one sits in front of the sign-out control.
 */
export function UserMenu({
  name,
  avatarUrl,
  role,
  walletPaise,
}: {
  name: string | null;
  avatarUrl: string | null;
  role: string;
  walletPaise: number;
}) {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent | TouchEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  async function signOut() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  }

  const initials =
    name
      ?.split(' ')
      .map((part) => part[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'PS';

  const isHost = role === 'host' || role === 'operator';
  const isAdmin = role === 'admin' || role === 'support';

  return (
    <div className="relative" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2 rounded-full border border-[var(--border-strong)] py-1 pl-1 pr-2.5 transition-colors hover:bg-[var(--surface-sunken)]"
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="" className="h-7 w-7 rounded-full object-cover" />
        ) : (
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--accent)] text-[11px] font-bold text-white">
            {initials}
          </span>
        )}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
        <span className="sr-only">Account menu</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-xl border bg-[var(--surface-raised)] shadow-[var(--shadow-raised)]"
        >
          <div className="border-b px-4 py-3">
            <p className="truncate text-sm font-semibold">{name ?? 'Your account'}</p>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
              Credit balance {formatPaise(walletPaise)}
            </p>
          </div>

          <div className="py-1">
            <MenuLink href="/bookings" onNavigate={() => setOpen(false)}>
              My bookings
            </MenuLink>
            <MenuLink href="/vehicles" onNavigate={() => setOpen(false)}>
              My vehicles
            </MenuLink>
            <MenuLink href="/wallet" onNavigate={() => setOpen(false)}>
              Credit and referrals
            </MenuLink>
            <MenuLink href="/profile" onNavigate={() => setOpen(false)}>
              Profile settings
            </MenuLink>
          </div>

          <div className="border-t py-1">
            {isHost ? (
              <MenuLink href="/host" onNavigate={() => setOpen(false)}>
                Host dashboard
              </MenuLink>
            ) : (
              <MenuLink href="/list-your-space" onNavigate={() => setOpen(false)}>
                List your space
              </MenuLink>
            )}
            {isAdmin && (
              <MenuLink href="/admin" onNavigate={() => setOpen(false)}>
                Admin
              </MenuLink>
            )}
          </div>

          <div className="border-t py-1">
            <button
              type="button"
              role="menuitem"
              onClick={signOut}
              disabled={signingOut}
              className={cn(
                'w-full px-4 py-2 text-left text-sm transition-colors hover:bg-[var(--surface-sunken)]',
                signingOut && 'opacity-60',
              )}
            >
              {signingOut ? 'Signing out...' : 'Sign out'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MenuLink({
  href,
  children,
  onNavigate,
}: {
  href: string;
  children: React.ReactNode;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      onClick={onNavigate}
      className="block px-4 py-2 text-sm transition-colors hover:bg-[var(--surface-sunken)]"
    >
      {children}
    </Link>
  );
}
