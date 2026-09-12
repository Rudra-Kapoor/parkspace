import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { Badge, Card, Stat } from '@/components/ui';
import { ProfileForm } from '@/components/profile-form';
import { createClient } from '@/lib/supabase/server';
import type { Profile } from '@/lib/types';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Profile settings',
  robots: { index: false, follow: false },
};

export default async function ProfilePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/auth/login?next=/profile');

  const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  const profile = data as Profile | null;

  if (!profile) redirect('/auth/login');

  return (
    <>
      <SiteHeader />

      <main id="main" className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <h1 className="text-2xl font-bold tracking-tight">Profile settings</h1>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <Stat label="Trust score" value={String(profile.trust_score)} hint="Out of 100" />
          <Stat label="Bookings completed" value={String(profile.bookings_completed)} />
          <Stat
            label="Member since"
            value={new Date(profile.created_at).toLocaleDateString('en-IN', {
              month: 'short',
              year: 'numeric',
            })}
          />
        </div>

        <Card className="mt-6 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">Verification</h2>
              <p className="mt-0.5 text-sm text-[var(--text-muted)]">
                Verified accounts rank better and are trusted by more hosts.
              </p>
            </div>
            <Badge tone={profile.verification === 'verified' ? 'success' : 'neutral'}>
              {profile.verification === 'verified' ? 'Verified' : 'Not verified'}
            </Badge>
          </div>
          <p className="mt-3 text-sm text-[var(--text-muted)]">
            Identity verification is not built in this deployment. The tables and the access
            policies for it exist, but there is no upload flow yet.
          </p>
        </Card>

        <div className="mt-6">
          <ProfileForm profile={profile} />
        </div>

        <Card className="mt-6 p-5">
          <h2 className="font-semibold">Your data</h2>
          <p className="mt-1.5 text-sm text-[var(--text-muted)]">
            You can ask for a copy of everything we hold about you, or ask us to delete your
            account. Financial records attached to completed bookings are kept where the law
            requires it, and the privacy policy says exactly which ones and for how long.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/legal/privacy" className="ps-btn ps-btn-secondary">
              Read the privacy policy
            </Link>
            <Link href="/legal/grievance" className="ps-btn ps-btn-ghost">
              Contact the grievance officer
            </Link>
          </div>
        </Card>
      </main>

      <SiteFooter />
    </>
  );
}
