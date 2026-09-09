import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { SiteHeader } from '@/components/site-header';
import { ReviewForm } from '@/components/review-form';
import { Alert } from '@/components/ui';
import { createClient } from '@/lib/supabase/server';
import type { Booking } from '@/lib/types';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Leave a review',
  robots: { index: false, follow: false },
};

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(`/auth/login?next=${encodeURIComponent(`/bookings/${id}/review`)}`);

  const { data: booking } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', id)
    .maybeSingle<Booking>();

  if (!booking) notFound();

  const isDriver = booking.driver_id === user.id;
  const isHost = booking.host_id === user.id;
  if (!isDriver && !isHost) notFound();

  const direction = isDriver ? 'driver_to_host' : 'host_to_driver';

  const { data: existing } = await supabase
    .from('reviews')
    .select('id')
    .eq('booking_id', booking.id)
    .eq('direction', direction)
    .maybeSingle();

  const snapshot = (booking.space_snapshot ?? {}) as Record<string, unknown>;
  const title = (snapshot.title as string) ?? 'this space';

  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-lg px-4 py-8 sm:px-6">
        <h1 className="text-2xl font-bold tracking-tight">
          {isDriver ? `How was ${title}?` : 'How was this driver?'}
        </h1>

        {existing ? (
          <Alert tone="success" title="You have already reviewed this booking" className="mt-6">
            <p className="mt-1">
              Your review stays hidden until the other side writes theirs, or until the
              14 day window closes. That is what stops reviews being written in response
              to each other.
            </p>
            <a href={`/bookings/${booking.id}`} className="ps-btn ps-btn-secondary mt-4">
              Back to the booking
            </a>
          </Alert>
        ) : booking.status !== 'completed' && booking.status !== 'no_show' ? (
          <Alert tone="warning" className="mt-6">
            You can review a booking once it is finished.
          </Alert>
        ) : (
          <>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              Reviews stay hidden until both sides have written one, so nobody can write
              theirs in reply to yours.
            </p>
            <div className="mt-7">
              <ReviewForm
                bookingId={booking.id}
                direction={direction}
                subjectId={isDriver ? booking.host_id : booking.driver_id}
                spaceId={isDriver ? booking.space_id : null}
              />
            </div>
          </>
        )}
      </main>
    </>
  );
}
