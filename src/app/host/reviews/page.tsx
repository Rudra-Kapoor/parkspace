import Link from 'next/link';
import { Alert, Card, EmptyState, Rating, Stat } from '@/components/ui';
import { createClient } from '@/lib/supabase/server';
import { formatDate, formatDateTime, one } from '@/lib/dashboard';
import { RespondForm } from './respond-form';

export const dynamic = 'force-dynamic';

interface ReviewRow {
  id: string;
  rating: number;
  rating_accuracy: number | null;
  rating_safety: number | null;
  rating_cleanliness: number | null;
  rating_accessibility: number | null;
  rating_value: number | null;
  comment: string | null;
  created_at: string;
  author_id: string;
  space_id: string | null;
  is_published: boolean;
  host_response: string | null;
  host_responded_at: string | null;
  parking_spaces: { title: string } | { title: string }[] | null;
}

const SUB_RATINGS: Array<{ key: keyof ReviewRow; label: string }> = [
  { key: 'rating_accuracy', label: 'Accuracy' },
  { key: 'rating_safety', label: 'Safety' },
  { key: 'rating_cleanliness', label: 'Cleanliness' },
  { key: 'rating_accessibility', label: 'Access' },
  { key: 'rating_value', label: 'Value' },
];

/**
 * Reviews about this host's spaces.
 *
 * Only driver_to_host reviews appear: a review the host wrote about a driver
 * belongs to that driver's record, not to this page. An unpublished review is
 * still shown to the host, marked as such, because the blind review window
 * hides it from the public and not from the person it is about.
 */
export default async function HostReviewsPage() {
  let reviews: ReviewRow[] = [];
  let authorNames = new Map<string, string>();
  let loadError: string | null = null;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error('No session');

    const { data, error } = await supabase
      .from('reviews')
      .select(
        'id, rating, rating_accuracy, rating_safety, rating_cleanliness, rating_accessibility, rating_value, comment, created_at, author_id, space_id, is_published, host_response, host_responded_at, parking_spaces(title)',
      )
      .eq('subject_id', user.id)
      .eq('direction', 'driver_to_host')
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) throw new Error(error.message);
    reviews = (data as unknown as ReviewRow[] | null) ?? [];

    const authorIds = Array.from(new Set(reviews.map((review) => review.author_id)));
    if (authorIds.length > 0) {
      const { data: profiles } = await supabase
        .from('public_profiles')
        .select('id, full_name')
        .in('id', authorIds);
      for (const row of (profiles as Array<{ id: string; full_name: string | null }> | null) ?? []) {
        authorNames.set(row.id, row.full_name ?? 'A ParkSpace driver');
      }
    }
  } catch {
    loadError =
      'We could not load your reviews. The database may be unreachable, or the migrations may not have been applied yet.';
  }

  const published = reviews.filter((review) => review.is_published);
  const total = published.length;
  const average =
    total > 0 ? published.reduce((sum, review) => sum + review.rating, 0) / total : null;

  const breakdown = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: published.filter((review) => review.rating === star).length,
  }));

  const awaitingReply = reviews.filter(
    (review) => review.is_published && !review.host_response,
  ).length;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Reviews</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          What drivers said after staying, and your replies.
        </p>
      </header>

      {loadError && (
        <Alert tone="warning" title="Nothing to show">
          <p className="mt-1">{loadError}</p>
        </Alert>
      )}

      {!loadError && reviews.length === 0 && (
        <EmptyState
          title="No reviews yet"
          description="A driver can review a stay once it is complete. Reviews stay hidden until both sides have written one, or until 14 days pass, so neither side can write in response to the other."
          action={
            <Link href="/host/bookings" className="ps-btn ps-btn-secondary">
              See your bookings
            </Link>
          }
        />
      )}

      {reviews.length > 0 && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat
              label="Average rating"
              value={average != null ? average.toFixed(1) : 'No reviews'}
              hint={total > 0 ? `From ${total} published reviews` : undefined}
              tone="accent"
            />
            <Stat label="Total reviews" value={total} hint="Published and visible to drivers" />
            <Stat
              label="Awaiting your reply"
              value={awaitingReply}
              hint={awaitingReply > 0 ? 'A reply is read by every future driver' : 'All answered'}
            />
          </div>

          <Card className="p-5">
            <h2 className="text-lg font-semibold">Rating breakdown</h2>
            <ul className="mt-3 space-y-2">
              {breakdown.map(({ star, count }) => {
                const percent = total > 0 ? Math.round((count / total) * 100) : 0;
                return (
                  <li key={star} className="flex items-center gap-3 text-sm">
                    <span className="w-14 shrink-0 tabular-nums">
                      {star} {star === 1 ? 'star' : 'stars'}
                    </span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
                      <span
                        className="block h-full rounded-full bg-[var(--accent)]"
                        style={{ width: `${percent}%` }}
                      />
                    </span>
                    <span className="w-12 shrink-0 text-right tabular-nums text-[var(--text-muted)]">
                      {count}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>

          <section aria-labelledby="all-reviews-heading">
            <h2 id="all-reviews-heading" className="text-lg font-semibold">
              All reviews
            </h2>
            <ul className="mt-3 space-y-4">
              {reviews.map((review) => (
                <Card key={review.id} as="li" className="p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Rating value={review.rating} size="md" />
                        <span className="text-sm font-semibold">
                          {authorNames.get(review.author_id) ?? 'A ParkSpace driver'}
                        </span>
                        {!review.is_published && (
                          <span className="ps-badge ps-badge-neutral">
                            Not public yet
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-[var(--text-muted)]">
                        {one(review.parking_spaces)?.title ?? 'Your space'} ·{' '}
                        {formatDate(review.created_at)}
                      </p>
                    </div>
                  </div>

                  {review.comment && (
                    <p className="mt-3 whitespace-pre-line text-sm leading-relaxed">
                      {review.comment}
                    </p>
                  )}

                  <ul className="ps-scroll-x mt-3 flex gap-4 text-xs text-[var(--text-muted)]">
                    {SUB_RATINGS.map(({ key, label }) => {
                      const value = review[key];
                      if (typeof value !== 'number') return null;
                      return (
                        <li key={label} className="shrink-0 whitespace-nowrap">
                          <span className="font-medium text-[var(--text)]">{value.toFixed(0)}</span>{' '}
                          {label}
                        </li>
                      );
                    })}
                  </ul>

                  <div className="mt-4 border-t pt-4">
                    {review.host_response ? (
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
                          Your reply · {formatDateTime(review.host_responded_at)}
                        </p>
                        <p className="mt-1 whitespace-pre-line text-sm">{review.host_response}</p>
                      </div>
                    ) : review.is_published ? (
                      <RespondForm reviewId={review.id} />
                    ) : (
                      <p className="text-sm text-[var(--text-muted)]">
                        You can reply once this review is published.
                      </p>
                    )}
                  </div>
                </Card>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
