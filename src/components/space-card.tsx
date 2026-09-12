import Link from 'next/link';
import { formatPaise } from '@/lib/money';
import { formatDistance, formatWalk } from '@/lib/geo';
import { photoUrl } from '@/lib/storage';
import { SPACE_TYPE_LABELS, AMENITY_LABELS, type SearchResult } from '@/lib/types';
import { AmenityIcon, Badge, Rating, cn } from './ui';

/**
 * A search result.
 *
 * The price shown depends on whether the driver told us when they are coming.
 * With times, we show the actual quoted total for their window, which is the
 * only number they care about. Without times, we fall back to the hourly rate
 * and label it, because showing a bare number that turns out to mean something
 * else at checkout is how a marketplace loses trust.
 */
export function SpaceCard({
  result,
  href,
  selected,
  onHover,
  onSelect,
  showPhoto = true,
}: {
  result: SearchResult;
  href: string;
  selected?: boolean;
  onHover?: (id: string | null) => void;
  onSelect?: (id: string) => void;
  showPhoto?: boolean;
}) {
  const hasQuote = result.quoted_base_paise != null;

  const priceLine = hasQuote
    ? { amount: formatPaise(result.quoted_base_paise as number), caption: 'total for your stay' }
    : result.price_hourly_paise != null
      ? { amount: formatPaise(result.price_hourly_paise), caption: 'per hour' }
      : result.price_daily_paise != null
        ? { amount: formatPaise(result.price_daily_paise), caption: 'per day' }
        : result.price_monthly_paise != null
          ? { amount: formatPaise(result.price_monthly_paise), caption: 'per month' }
          : { amount: 'Ask', caption: '' };

  const topAmenities = result.amenities.slice(0, 3);
  const photo = photoUrl(result.primary_photo);

  return (
    <article
      data-space-card={result.id}
      className={cn(
        'ps-card group relative overflow-hidden transition-shadow',
        selected ? 'ring-2 ring-[var(--accent)]' : 'hover:shadow-[var(--shadow-raised)]',
      )}
      onMouseEnter={() => onHover?.(result.id)}
      onMouseLeave={() => onHover?.(null)}
      onFocus={() => onSelect?.(result.id)}
    >
      <div className="flex gap-0">
        {showPhoto && (
          <div className="relative hidden w-36 shrink-0 bg-[var(--surface-sunken)] sm:block">
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photo}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover"
              />
            ) : (
              <PhotoPlaceholder />
            )}
          </div>
        )}

        <div className="min-w-0 flex-1 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-[0.9375rem] font-semibold leading-snug">
                {/* The whole card is clickable via this stretched link, so the
                    accessible name stays on one element rather than being split
                    across several nested links. */}
                <Link href={href} className="after:absolute after:inset-0 after:content-['']">
                  {result.title}
                </Link>
              </h3>

              <p className="mt-0.5 truncate text-xs text-[var(--text-muted)]">
                {SPACE_TYPE_LABELS[result.space_type]} in {result.locality}
              </p>
            </div>

            <div className="shrink-0 text-right">
              <p className="text-base font-bold leading-none tabular-nums">{priceLine.amount}</p>
              {priceLine.caption && (
                <p className="mt-1 text-[0.6875rem] text-[var(--text-muted)]">
                  {priceLine.caption}
                </p>
              )}
            </div>
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-[var(--text-muted)]">
            <span className="inline-flex items-center gap-1 font-medium text-[var(--text)]">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M12 21s-7-5.5-7-11a7 7 0 1114 0c0 5.5-7 11-7 11z" />
                <circle cx="12" cy="10" r="2.5" />
              </svg>
              {formatDistance(result.distance_m)}
            </span>
            <span>{formatWalk(result.distance_m)}</span>
            <Rating value={result.avg_rating} count={result.review_count} />
          </div>

          {(topAmenities.length > 0 || result.instant_book || result.is_superhost) && (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {result.is_superhost && <Badge tone="accent">Superhost</Badge>}
              {result.instant_book && <Badge tone="success">Instant book</Badge>}
              {result.has_ev_charging && <Badge tone="neutral">EV charging</Badge>}
              {topAmenities.map((amenity) => (
                <span
                  key={amenity}
                  className="inline-flex items-center gap-1 text-[0.6875rem] text-[var(--text-muted)]"
                >
                  <AmenityIcon name={amenity} className="h-3 w-3" />
                  {AMENITY_LABELS[amenity] ?? amenity}
                </span>
              ))}
            </div>
          )}

          {/* Scarcity, but only when it is true. A fake "1 left" is the fastest
              way to make a marketplace feel dishonest. */}
          {result.free_bays > 0 && result.free_bays <= 2 && result.capacity > 1 && (
            <p className="mt-2 text-xs font-medium text-amber-600 dark:text-amber-400">
              Only {result.free_bays} of {result.capacity} bays left for these times
            </p>
          )}

          {result.max_height_mm != null && (
            <p className="mt-2 text-[0.6875rem] text-[var(--text-muted)]">
              Height limit {(result.max_height_mm / 1000).toFixed(1)} m
            </p>
          )}
        </div>
      </div>
    </article>
  );
}

function PhotoPlaceholder() {
  return (
    <div className="flex h-full min-h-28 w-full items-center justify-center text-[var(--text-muted)]">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 15l5-4 4 3 3-2 6 5" />
        <circle cx="8.5" cy="9.5" r="1.5" />
      </svg>
    </div>
  );
}
