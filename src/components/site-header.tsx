import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Logo } from './ui';
import { UserMenu } from './user-menu';

/**
 * Site header.
 *
 * A server component so the signed-in state is correct on first paint. A header
 * that renders "Sign in" and then flips to an avatar a moment later is the most
 * common way a logged-in user is made to feel logged out.
 */
export async function SiteHeader({ variant = 'default' }: { variant?: 'default' | 'compact' }) {
  let profile: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
    role: string;
    wallet_balance_paise: number;
  } | null = null;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url, role, wallet_balance_paise')
        .eq('id', user.id)
        .single();
      profile = data;
    }
  } catch {
    // Not configured yet. The header still renders, which is what lets the
    // landing page show a setup guide instead of a crash on a fresh clone.
    profile = null;
  }

  return (
    <header className="sticky top-0 z-50 border-b bg-[var(--surface)]/90 backdrop-blur">
      <div
        className={
          variant === 'compact'
            ? 'flex h-14 items-center gap-4 px-4'
            : 'mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6'
        }
      >
        <Link href="/" className="shrink-0" aria-label="ParkSpace home">
          <Logo />
        </Link>

        <nav aria-label="Main" className="ml-2 hidden items-center gap-1 md:flex">
          <HeaderLink href="/search">Find parking</HeaderLink>
          <HeaderLink href="/list-your-space">List your space</HeaderLink>
          <HeaderLink href="/how-it-works">How it works</HeaderLink>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {profile ? (
            <UserMenu
              name={profile.full_name}
              avatarUrl={profile.avatar_url}
              role={profile.role}
              walletPaise={profile.wallet_balance_paise}
            />
          ) : (
            <>
              <Link href="/auth/login" className="ps-btn ps-btn-ghost hidden sm:inline-flex">
                Sign in
              </Link>
              <Link href="/auth/register" className="ps-btn ps-btn-primary">
                Get started
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function HeaderLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-lg px-3 py-2 text-sm font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text)]"
    >
      {children}
    </Link>
  );
}
