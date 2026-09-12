'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { ReviewDirection } from '@/lib/types';
import { Alert, Card, cn } from './ui';

const SUB_RATINGS = [
  { key: 'rating_accuracy', label: 'Matched the listing', hint: 'Was it what the photos and description showed' },
  { key: 'rating_safety', label: 'Felt safe', hint: 'Lighting, security, how comfortable you felt leaving the car' },
  { key: 'rating_cleanliness', label: 'Condition', hint: 'How well kept the space was' },
  { key: 'rating_accessibility', label: 'Easy to get in and out', hint: 'Entrance, manoeuvring, any gate' },
  { key: 'rating_value', label: 'Worth the price', hint: 'Value for what you paid' },
] as const;

export function ReviewForm({
  bookingId,
  direction,
  subjectId,
  spaceId,
}: {
  bookingId: string;
  direction: ReviewDirection;
  subjectId: string;
  spaceId: string | null;
}) {
  const router = useRouter();
  const [rating, setRating] = useState(0);
  const [subRatings, setSubRatings] = useState<Record<string, number>>({});
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();

    if (rating === 0) {
      setError('Choose a star rating first.');
      return;
    }

    setBusy(true);
    setError(null);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError('Your session expired. Sign in again.');
      setBusy(false);
      return;
    }

    const { error: insertError } = await supabase.from('reviews').insert({
      booking_id: bookingId,
      space_id: spaceId,
      author_id: user.id,
      subject_id: subjectId,
      direction,
      rating,
      ...(direction === 'driver_to_host' ? subRatings : {}),
      comment: comment.trim() || null,
    });

    if (insertError) {
      setError(
        insertError.code === '23505'
          ? 'You have already reviewed this booking.'
          : 'We could not save that review. Try again.',
      );
      setBusy(false);
      return;
    }

    router.push(`/bookings/${bookingId}`);
    router.refresh();
  }

  return (
    <Card className="p-5">
      <form onSubmit={submit}>
        {error && (
          <Alert tone="danger" className="mb-4">
            {error}
          </Alert>
        )}

        <fieldset>
          <legend className="ps-label">Overall</legend>
          <StarInput value={rating} onChange={setRating} size="lg" />
        </fieldset>

        {direction === 'driver_to_host' && (
          <div className="mt-6 space-y-4 border-t pt-5">
            {SUB_RATINGS.map((item) => (
              <fieldset key={item.key}>
                <legend className="text-sm font-medium">{item.label}</legend>
                <p className="mb-1.5 text-xs text-[var(--text-muted)]">{item.hint}</p>
                <StarInput
                  value={subRatings[item.key] ?? 0}
                  onChange={(value) =>
                    setSubRatings((current) => ({ ...current, [item.key]: value }))
                  }
                />
              </fieldset>
            ))}
          </div>
        )}

        <div className="mt-6 border-t pt-5">
          <label htmlFor="review-comment" className="ps-label">
            Anything else, optional
          </label>
          <textarea
            id="review-comment"
            rows={4}
            maxLength={2000}
            className="ps-input resize-y"
            placeholder={
              direction === 'driver_to_host'
                ? 'What would the next driver want to know before they book this space?'
                : 'Did the driver follow the rules and leave on time?'
            }
            value={comment}
            onChange={(event) => setComment(event.target.value)}
          />
          <p className="ps-hint">{comment.length} of 2000 characters</p>
        </div>

        <button type="submit" disabled={busy} className="ps-btn ps-btn-primary mt-5 w-full">
          {busy ? 'Submitting...' : 'Submit review'}
        </button>
      </form>
    </Card>
  );
}

/**
 * Star input.
 *
 * Radio buttons under the hood rather than clickable divs, so it is operable
 * with arrow keys, announced correctly by a screen reader, and works inside a
 * form without any JavaScript wiring of its own.
 */
function StarInput({
  value,
  onChange,
  size = 'md',
}: {
  value: number;
  onChange: (value: number) => void;
  size?: 'md' | 'lg';
}) {
  const dimension = size === 'lg' ? 34 : 24;
  const labels = ['Poor', 'Not great', 'Fine', 'Good', 'Excellent'];

  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <label
          key={star}
          className="cursor-pointer p-0.5"
          title={labels[star - 1]}
        >
          <input
            type="radio"
            name={`rating-${size}-${labels.length}`}
            value={star}
            checked={value === star}
            onChange={() => onChange(star)}
            className="sr-only-focusable absolute h-px w-px opacity-0"
          />
          <svg
            width={dimension}
            height={dimension}
            viewBox="0 0 20 20"
            fill={star <= value ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth="1.4"
            aria-hidden="true"
            className={cn(
              'transition-colors',
              star <= value ? 'text-amber-500' : 'text-[var(--border-strong)]',
            )}
          >
            <path d="M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 14.9l-5.2 2.7 1-5.8L1.5 7.7l5.9-.9L10 1.5z" />
          </svg>
          <span className="sr-only">
            {star} {star === 1 ? 'star' : 'stars'}, {labels[star - 1]}
          </span>
        </label>
      ))}
      {value > 0 && (
        <span className="ml-2 text-sm text-[var(--text-muted)]">{labels[value - 1]}</span>
      )}
    </div>
  );
}
