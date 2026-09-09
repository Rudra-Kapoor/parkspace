'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Card, cn } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';
import { formatDate, formatDateTime, labelFor, LISTING_STATUS_LABELS } from '@/lib/dashboard';

/**
 * The month grid.
 *
 * Reads space_availability_calendar() rather than reconstructing availability
 * in the browser from rules, blocks and bookings. There is exactly one
 * implementation of "is this day bookable", it lives in the database, and the
 * calendar a host looks at is the same one the booking engine enforces.
 */

export interface CalendarSpace {
  id: string;
  title: string;
  capacity: number;
  status: string;
  locality: string;
}

interface CalendarDay {
  day: string;
  total_bays: number;
  booked_bays: number;
  is_blocked: boolean;
  has_rules: boolean;
  multiplier_bp: number;
}

interface BlockRow {
  id: string;
  starts_at: string;
  ends_at: string;
  reason: string | null;
}

const WEEKDAY_HEADS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** A plain YYYY-MM-DD key, built without touching the local timezone. */
function dateKey(year: number, monthIndex: number, day: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function firstWeekdayOfMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();
}

const MONTH_LABEL = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' });

export function CalendarClient({
  spaces,
  initialSpaceId,
}: {
  spaces: CalendarSpace[];
  initialSpaceId: string;
}) {
  const now = new Date();
  const [spaceId, setSpaceId] = useState(initialSpaceId);
  const [year, setYear] = useState(now.getFullYear());
  const [monthIndex, setMonthIndex] = useState(now.getMonth());
  const [days, setDays] = useState<CalendarDay[]>([]);
  const [blocks, setBlocks] = useState<BlockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [blockFrom, setBlockFrom] = useState('');
  const [blockTo, setBlockTo] = useState('');
  const [blockReason, setBlockReason] = useState('');
  const [blocking, setBlocking] = useState(false);
  const [blockError, setBlockError] = useState<string | null>(null);

  const space = spaces.find((entry) => entry.id === spaceId) ?? spaces[0];

  const from = dateKey(year, monthIndex, 1);
  const to = dateKey(year, monthIndex, daysInMonth(year, monthIndex));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();

      const [calendarResult, blocksResult] = await Promise.all([
        supabase.rpc('space_availability_calendar', {
          p_space_id: spaceId,
          p_from: from,
          p_to: to,
        }),
        supabase
          .from('availability_blocks')
          .select('id, starts_at, ends_at, reason')
          .eq('space_id', spaceId)
          .lt('starts_at', `${to}T23:59:59Z`)
          .gt('ends_at', `${from}T00:00:00Z`)
          .order('starts_at'),
      ]);

      if (calendarResult.error) throw new Error(calendarResult.error.message);

      setDays((calendarResult.data as CalendarDay[] | null) ?? []);
      setBlocks((blocksResult.data as BlockRow[] | null) ?? []);
    } catch {
      setError('We could not load the calendar for that month. Try again in a moment.');
      setDays([]);
      setBlocks([]);
    } finally {
      setLoading(false);
    }
  }, [spaceId, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarDay>();
    for (const entry of days) {
      // The RPC returns a date; PostgREST serialises it as YYYY-MM-DD.
      map.set(String(entry.day).slice(0, 10), entry);
    }
    return map;
  }, [days]);

  const cells = useMemo(() => {
    const leading = firstWeekdayOfMonth(year, monthIndex);
    const total = daysInMonth(year, monthIndex);
    const result: Array<{ key: string; dayNumber: number | null }> = [];
    for (let index = 0; index < leading; index += 1) {
      result.push({ key: `pad-${index}`, dayNumber: null });
    }
    for (let day = 1; day <= total; day += 1) {
      result.push({ key: dateKey(year, monthIndex, day), dayNumber: day });
    }
    return result;
  }, [year, monthIndex]);

  function shiftMonth(delta: number) {
    const next = new Date(Date.UTC(year, monthIndex + delta, 1));
    setYear(next.getUTCFullYear());
    setMonthIndex(next.getUTCMonth());
  }

  async function submitBlock(event: React.FormEvent) {
    event.preventDefault();
    setBlockError(null);

    if (!blockFrom || !blockTo) {
      setBlockError('Pick both a first and a last date to close off');
      return;
    }
    if (blockTo < blockFrom) {
      setBlockError('The last date cannot be before the first');
      return;
    }

    // A block is stored as a half-open interval, so the last closed date runs to
    // midnight at the start of the following day. Without the +1 the host's
    // final day would still be bookable, which is exactly the kind of off-by-one
    // that turns into a double booking.
    const endExclusive = new Date(`${blockTo}T00:00:00+05:30`);
    endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);

    setBlocking(true);
    try {
      const response = await fetch('/api/host/availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          space_id: spaceId,
          starts_at: new Date(`${blockFrom}T00:00:00+05:30`).toISOString(),
          ends_at: endExclusive.toISOString(),
          reason: blockReason.trim() || undefined,
        }),
      });
      const body = (await response.json()) as { ok?: boolean; message?: string };
      if (!response.ok || !body.ok) {
        setBlockError(body.message ?? 'We could not save that block.');
        return;
      }
      setBlockFrom('');
      setBlockTo('');
      setBlockReason('');
      await load();
    } catch {
      setBlockError('We could not reach the server. Check your connection and try again.');
    } finally {
      setBlocking(false);
    }
  }

  async function removeBlock(id: string) {
    setBlockError(null);
    try {
      const response = await fetch(`/api/host/availability?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        setBlockError('We could not remove that block.');
        return;
      }
      await load();
    } catch {
      setBlockError('We could not reach the server. Check your connection and try again.');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1">
          <label className="ps-label" htmlFor="calendar-space">
            Space
          </label>
          <select
            id="calendar-space"
            className="ps-input"
            value={spaceId}
            onChange={(event) => setSpaceId(event.target.value)}
          >
            {spaces.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.title} ({labelFor(LISTING_STATUS_LABELS, entry.status)})
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="ps-btn ps-btn-secondary"
            onClick={() => shiftMonth(-1)}
            aria-label="Previous month"
          >
            Previous
          </button>
          <p className="min-w-40 text-center font-semibold">
            {MONTH_LABEL.format(new Date(Date.UTC(year, monthIndex, 1)))}
          </p>
          <button
            type="button"
            className="ps-btn ps-btn-secondary"
            onClick={() => shiftMonth(1)}
            aria-label="Next month"
          >
            Next
          </button>
        </div>
      </div>

      {error && (
        <Alert tone="warning" title="The calendar did not load">
          <p className="mt-1">{error}</p>
        </Alert>
      )}

      <Card className="p-3 sm:p-4">
        <div className="ps-scroll-x">
          <div className="min-w-[35rem]">
            <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-[var(--text-muted)]">
              {WEEKDAY_HEADS.map((head) => (
                <div key={head} className="py-1">
                  {head}
                </div>
              ))}
            </div>

            <div className="mt-1 grid grid-cols-7 gap-1">
              {cells.map((cell) => {
                if (cell.dayNumber == null) {
                  return <div key={cell.key} aria-hidden="true" className="min-h-20 rounded-lg" />;
                }

                const entry = byDay.get(cell.key);
                const capacity = entry?.total_bays ?? space?.capacity ?? 1;
                const booked = entry?.booked_bays ?? 0;
                const free = Math.max(0, capacity - booked);
                const blocked = entry?.is_blocked ?? false;
                const closed = !(entry?.has_rules ?? true);
                const multiplier = entry?.multiplier_bp ?? 10_000;

                const tone = blocked
                  ? 'border-rose-500/40 bg-rose-500/10'
                  : closed
                    ? 'border-dashed border-[var(--border)] bg-[var(--surface-sunken)]'
                    : free === 0
                      ? 'border-amber-500/40 bg-amber-500/10'
                      : booked > 0
                        ? 'border-teal-500/40 bg-teal-500/10'
                        : 'border-[var(--border)]';

                return (
                  <div
                    key={cell.key}
                    className={cn('min-h-20 rounded-lg border p-1.5 text-left', tone)}
                  >
                    <p className="text-xs font-bold tabular-nums">{cell.dayNumber}</p>

                    {loading ? (
                      <p className="mt-1 text-[0.6875rem] text-[var(--text-muted)]">...</p>
                    ) : blocked ? (
                      <p className="mt-1 text-[0.6875rem] font-semibold text-rose-600 dark:text-rose-400">
                        Blocked
                      </p>
                    ) : closed ? (
                      <p className="mt-1 text-[0.6875rem] text-[var(--text-muted)]">Closed</p>
                    ) : (
                      <>
                        <p className="mt-1 text-[0.6875rem] tabular-nums text-[var(--text-muted)]">
                          {booked} of {capacity} booked
                        </p>
                        {multiplier !== 10_000 && (
                          <p className="mt-0.5 text-[0.6875rem] font-semibold text-[var(--accent-text)]">
                            {(multiplier / 10_000).toFixed(2)}x price
                          </p>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t pt-3 text-xs text-[var(--text-muted)]">
          <LegendItem className="border-[var(--border)]" label="Free" />
          <LegendItem className="border-teal-500/40 bg-teal-500/10" label="Partly booked" />
          <LegendItem className="border-amber-500/40 bg-amber-500/10" label="Fully booked" />
          <LegendItem className="border-rose-500/40 bg-rose-500/10" label="Blocked by you" />
          <LegendItem
            className="border-dashed border-[var(--border)] bg-[var(--surface-sunken)]"
            label="Closed, no opening hours that day"
          />
        </ul>
      </Card>

      <Card className="p-5">
        <h2 className="text-lg font-semibold">Close off some dates</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          A block stops new bookings for those dates without changing your weekly opening hours.
          Bookings already confirmed are not affected, so cancel those separately if you need to.
        </p>

        <form onSubmit={submitBlock} className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="ps-label" htmlFor="block-from">
              First date closed
            </label>
            <input
              id="block-from"
              type="date"
              className="ps-input"
              value={blockFrom}
              onChange={(event) => setBlockFrom(event.target.value)}
              required
            />
          </div>
          <div>
            <label className="ps-label" htmlFor="block-to">
              Last date closed
            </label>
            <input
              id="block-to"
              type="date"
              className="ps-input"
              value={blockTo}
              onChange={(event) => setBlockTo(event.target.value)}
              required
            />
          </div>
          <div className="sm:col-span-2 lg:col-span-1">
            <label className="ps-label" htmlFor="block-reason">
              Reason
            </label>
            <input
              id="block-reason"
              className="ps-input"
              placeholder="Optional, only you see it"
              value={blockReason}
              onChange={(event) => setBlockReason(event.target.value)}
              maxLength={200}
            />
          </div>
          <div className="flex items-end">
            <button type="submit" className="ps-btn ps-btn-primary w-full" disabled={blocking}>
              {blocking ? 'Saving...' : 'Block these dates'}
            </button>
          </div>
        </form>

        {blockError && (
          <div className="mt-4">
            <Alert tone="danger" title="That did not work">
              <p className="mt-1">{blockError}</p>
            </Alert>
          </div>
        )}

        <div className="mt-5 border-t pt-4">
          <h3 className="text-sm font-semibold">Blocks in this month</h3>
          {blocks.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              Nothing blocked in {MONTH_LABEL.format(new Date(Date.UTC(year, monthIndex, 1)))}.
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {blocks.map((block) => (
                <li
                  key={block.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                >
                  <span>
                    <span className="font-medium">
                      {formatDate(block.starts_at)} to {formatDate(block.ends_at)}
                    </span>
                    {block.reason && (
                      <span className="block text-[var(--text-muted)]">{block.reason}</span>
                    )}
                    <span className="block text-xs text-[var(--text-muted)]">
                      Ends {formatDateTime(block.ends_at)}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="ps-btn ps-btn-ghost text-sm"
                    onClick={() => void removeBlock(block.id)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
}

function LegendItem({ className, label }: { className: string; label: string }) {
  return (
    <li className="flex items-center gap-1.5">
      <span className={cn('inline-block size-3 rounded border', className)} aria-hidden="true" />
      {label}
    </li>
  );
}
