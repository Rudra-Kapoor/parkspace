'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { formatPaise, formatPaiseCompact } from '@/lib/money';

/**
 * Twelve months of payouts.
 *
 * One series, not three. A host wants to know what they took home, and stacking
 * gross, commission and net on the same bar makes the only number that matters
 * harder to read. The per-booking breakdown sits in the table below the chart,
 * which is where somebody checking the arithmetic will go anyway.
 */

export interface MonthlyEarning {
  /** Short month label, already formatted in the operating timezone. */
  month: string;
  payoutPaise: number;
  bookings: number;
}

interface TooltipPayloadEntry {
  payload?: MonthlyEarning;
}

function EarningsTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
}) {
  const entry = active ? payload?.[0]?.payload : undefined;
  if (!entry) return null;

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm shadow-[var(--shadow-card)]">
      <p className="font-semibold">{entry.month}</p>
      <p className="mt-0.5 tabular-nums">{formatPaise(entry.payoutPaise)}</p>
      <p className="text-xs text-[var(--text-muted)]">
        {entry.bookings} {entry.bookings === 1 ? 'completed stay' : 'completed stays'}
      </p>
    </div>
  );
}

export function EarningsChart({ data }: { data: MonthlyEarning[] }) {
  const hasAnything = data.some((entry) => entry.payoutPaise > 0);

  if (!hasAnything) {
    return (
      <p className="py-10 text-center text-sm text-[var(--text-muted)]">
        Nothing to chart yet. Completed stays appear here month by month.
      </p>
    );
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 12, fill: 'var(--text-muted)' }}
            tickLine={false}
            axisLine={{ stroke: 'var(--border)' }}
          />
          <YAxis
            tick={{ fontSize: 12, fill: 'var(--text-muted)' }}
            tickLine={false}
            axisLine={false}
            width={56}
            tickFormatter={(value: number) => formatPaiseCompact(Math.max(0, Math.round(value)))}
          />
          <Tooltip content={<EarningsTooltip />} cursor={{ fill: 'var(--accent-soft)' }} />
          <Bar dataKey="payoutPaise" fill="var(--accent)" radius={[4, 4, 0, 0]} maxBarSize={48} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
