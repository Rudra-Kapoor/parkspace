import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { ReactNode } from 'react';

export function cn(...inputs: Parameters<typeof clsx>) {
  return twMerge(clsx(inputs));
}

// ---------------------------------------------------------------------------
// Logo
// ---------------------------------------------------------------------------

export function Logo({ className, showWord = true }: { className?: string; showWord?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <svg
        width="28"
        height="28"
        viewBox="0 0 28 28"
        fill="none"
        aria-hidden="true"
        className="shrink-0"
      >
        <rect width="28" height="28" rx="8" fill="var(--accent)" />
        {/* A P that also reads as a parking sign. */}
        <path
          d="M10 20.5V7.5h5.1c2.7 0 4.4 1.6 4.4 4.1s-1.7 4.2-4.4 4.2h-2.3v4.7H10Zm2.8-7.1h1.9c1.2 0 1.9-.6 1.9-1.7s-.7-1.7-1.9-1.7h-1.9v3.4Z"
          fill="white"
        />
      </svg>
      {showWord && (
        <span className="text-[1.0625rem] font-bold tracking-tight">ParkSpace</span>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Badges, cards, empty states
// ---------------------------------------------------------------------------

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'accent' | 'warning' | 'danger' | 'success';
  className?: string;
}) {
  const tones: Record<string, string> = {
    neutral: 'ps-badge-neutral',
    accent: 'ps-badge-accent',
    warning: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
    danger: 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
    success: 'bg-teal-500/15 text-teal-700 dark:text-teal-300',
  };
  return <span className={cn('ps-badge', tones[tone], className)}>{children}</span>;
}

export function Card({
  children,
  className,
  as: Component = 'div',
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'article' | 'section' | 'li';
}) {
  return <Component className={cn('ps-card', className)}>{children}</Component>;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-14 text-center">
      {icon && <div className="text-[var(--text-muted)]">{icon}</div>}
      <h3 className="text-base font-semibold">{title}</h3>
      {description && (
        <p className="max-w-sm text-sm text-[var(--text-muted)]">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rating
// ---------------------------------------------------------------------------

export function Rating({
  value,
  count,
  size = 'sm',
}: {
  value: number | null;
  count?: number;
  size?: 'sm' | 'md';
}) {
  if (value == null) {
    return (
      <span className={cn('text-[var(--text-muted)]', size === 'sm' ? 'text-xs' : 'text-sm')}>
        No reviews yet
      </span>
    );
  }

  return (
    <span
      className={cn('inline-flex items-center gap-1', size === 'sm' ? 'text-xs' : 'text-sm')}
      title={`Rated ${value.toFixed(1)} out of 5${count ? ` from ${count} reviews` : ''}`}
    >
      <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="text-amber-500">
        <path d="M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 14.9l-5.2 2.7 1-5.8L1.5 7.7l5.9-.9L10 1.5z" />
      </svg>
      <span className="font-semibold">{value.toFixed(1)}</span>
      {count != null && count > 0 && (
        <span className="text-[var(--text-muted)]">({count})</span>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Alert
// ---------------------------------------------------------------------------

export function Alert({
  tone = 'info',
  title,
  children,
  className,
}: {
  tone?: 'info' | 'success' | 'warning' | 'danger';
  title?: string;
  children?: ReactNode;
  className?: string;
}) {
  const tones: Record<string, string> = {
    info: 'border-[var(--border)] bg-[var(--surface-sunken)]',
    success: 'border-teal-500/30 bg-teal-500/10',
    warning: 'border-amber-500/35 bg-amber-500/10',
    danger: 'border-rose-500/35 bg-rose-500/10',
  };

  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn('rounded-xl border px-4 py-3 text-sm', tones[tone], className)}
    >
      {title && <p className="mb-0.5 font-semibold">{title}</p>}
      {children && <div className="text-[var(--text-muted)]">{children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeletons
// ---------------------------------------------------------------------------

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('ps-skeleton', className)} aria-hidden="true" />;
}

export function SpaceCardSkeleton() {
  return (
    <div className="ps-card overflow-hidden">
      <Skeleton className="h-40 w-full rounded-none" />
      <div className="space-y-2 p-4">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-3 w-1/3" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stat
// ---------------------------------------------------------------------------

export function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: 'accent' | 'default';
}) {
  return (
    <div className="ps-card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </p>
      <p
        className={cn(
          'mt-1 text-2xl font-bold tabular-nums',
          tone === 'accent' && 'text-[var(--accent-text)]',
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-[var(--text-muted)]">{hint}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Amenity and feature icons, kept inline so there is no icon-font dependency
// ---------------------------------------------------------------------------

export function AmenityIcon({ name, className }: { name: string; className?: string }) {
  const common = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, className };

  switch (name) {
    case 'cctv':
      return (
        <svg {...common} aria-hidden="true">
          <path d="M3 7l14-4 2 6-14 4z" /><path d="M6 13v4" /><path d="M4 21h6" /><path d="M17 9l4 1" />
        </svg>
      );
    case 'security_guard':
    case 'attendant':
      return (
        <svg {...common} aria-hidden="true">
          <path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z" />
        </svg>
      );
    case 'covered':
    case 'lift':
      return (
        <svg {...common} aria-hidden="true">
          <path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" />
        </svg>
      );
    case 'lit':
    case 'power_backup':
      return (
        <svg {...common} aria-hidden="true">
          <path d="M13 2L4 14h7l-1 8 9-12h-7z" />
        </svg>
      );
    case 'ev_charging':
      return (
        <svg {...common} aria-hidden="true">
          <rect x="4" y="3" width="10" height="18" rx="2" /><path d="M9 8l-2 4h4l-2 4" /><path d="M18 8v7a2 2 0 004 0V9l-2-3" />
        </svg>
      );
    case 'gated':
      return (
        <svg {...common} aria-hidden="true">
          <path d="M3 20V8l9-4 9 4v12" /><path d="M3 14h18" /><path d="M12 4v16" />
        </svg>
      );
    case 'wash':
      return (
        <svg {...common} aria-hidden="true">
          <path d="M12 3s5 5.5 5 9a5 5 0 01-10 0c0-3.5 5-9 5-9z" />
        </svg>
      );
    case 'wheelchair_accessible':
      return (
        <svg {...common} aria-hidden="true">
          <circle cx="12" cy="4" r="2" /><path d="M11 7v6h5l3 6" /><path d="M16 13a5 5 0 11-5 5" />
        </svg>
      );
    default:
      return (
        <svg {...common} aria-hidden="true">
          <circle cx="12" cy="12" r="9" /><path d="M9 12l2 2 4-4" />
        </svg>
      );
  }
}
