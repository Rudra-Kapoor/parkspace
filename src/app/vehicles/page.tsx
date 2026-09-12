import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { Alert } from '@/components/ui';
import { VehicleManager } from '@/components/vehicle-manager';
import { createClient } from '@/lib/supabase/server';
import type { Vehicle } from '@/lib/types';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'My vehicles',
  robots: { index: false, follow: false },
};

export default async function VehiclesPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/auth/login?next=/vehicles');

  const { data } = await supabase
    .from('vehicles')
    .select('*')
    .eq('owner_id', user.id)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true });

  return (
    <>
      <SiteHeader />

      <main id="main" className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <h1 className="text-2xl font-bold tracking-tight">My vehicles</h1>
        <p className="mt-1.5 text-sm text-[var(--text-muted)]">
          Hosts use the registration to identify your vehicle at the gate, and we use the
          dimensions to stop you booking a space your car will not fit into.
        </p>

        {reason === 'booking' && (
          <Alert tone="warning" title="Add a vehicle to continue" className="mt-5">
            <p className="mt-1">
              You need at least one vehicle on your account before you can book. It takes
              about twenty seconds.
            </p>
          </Alert>
        )}

        <div className="mt-7">
          <VehicleManager initialVehicles={(data ?? []) as Vehicle[]} />
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
