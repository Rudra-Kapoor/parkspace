import Link from 'next/link';
import { Alert, EmptyState } from '@/components/ui';
import { createClient } from '@/lib/supabase/server';
import { CalendarClient, type CalendarSpace } from './calendar-client';

export const dynamic = 'force-dynamic';

/**
 * Host calendar.
 *
 * The list of spaces is fetched on the server so the page is useful before the
 * calendar bundle loads. The month grid itself is client side, because it calls
 * space_availability_calendar() again every time the host changes month or
 * space, and round-tripping the whole page for that would feel broken.
 */
export default async function HostCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ space?: string }>;
}) {
  const params = await searchParams;

  let spaces: CalendarSpace[] = [];
  let loadError: string | null = null;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error('No session');

    const { data, error } = await supabase
      .from('parking_spaces')
      .select('id, title, capacity, status, locality')
      .eq('host_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    spaces = (data as CalendarSpace[] | null) ?? [];
  } catch {
    loadError =
      'We could not load your spaces. The database may be unreachable, or the migrations may not have been applied yet.';
  }

  const requested = params.space;
  const initialSpaceId =
    requested && spaces.some((space) => space.id === requested)
      ? requested
      : (spaces[0]?.id ?? null);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Calendar</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          What is booked, what is blocked, and what a date costs.
        </p>
      </header>

      {loadError && (
        <Alert tone="warning" title="Nothing to show">
          <p className="mt-1">{loadError}</p>
        </Alert>
      )}

      {!loadError && spaces.length === 0 && (
        <EmptyState
          title="No spaces to show"
          description="The calendar appears once you have a listing. It shows bookings per day and lets you close off dates you need the space yourself."
          action={
            <Link href="/host/spaces/new" className="ps-btn ps-btn-primary">
              List a space
            </Link>
          }
        />
      )}

      {spaces.length > 0 && initialSpaceId && (
        <CalendarClient spaces={spaces} initialSpaceId={initialSpaceId} />
      )}
    </div>
  );
}
