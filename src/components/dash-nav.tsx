'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from './ui';

/**
 * The dashboard navigation shared by the host and admin shells.
 *
 * One component rather than two because the two surfaces have the same shape:
 * a vertical rail on a wide screen and a horizontally scrolling tab strip on a
 * phone. The tab strip scrolls rather than wraps, so the page itself never
 * gains a horizontal scrollbar no matter how many sections are added.
 */

export interface DashNavItem {
  href: string;
  label: string;
  /** Shown as a small count pill, for queues that need attention. */
  badge?: number;
}

export function DashNav({
  items,
  ariaLabel,
}: {
  items: DashNavItem[];
  ariaLabel: string;
}) {
  const pathname = usePathname() ?? '';

  // The first item is the section root and must match exactly, otherwise every
  // child route would light it up as well as its own tab.
  const isActive = (href: string, index: number) =>
    index === 0 ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav aria-label={ariaLabel} className="lg:w-56 lg:shrink-0">
      <ul className="ps-scroll-x -mx-4 flex gap-1 border-b px-4 pb-2 lg:mx-0 lg:flex-col lg:border-b-0 lg:px-0 lg:pb-0">
        {items.map((item, index) => {
          const active = isActive(item.href, index);
          return (
            <li key={item.href} className="shrink-0 lg:shrink">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'bg-[var(--accent-soft)] text-[var(--accent-text)]'
                    : 'text-[var(--text-muted)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text)]',
                )}
              >
                <span>{item.label}</span>
                {item.badge != null && item.badge > 0 && (
                  <span className="ps-badge ps-badge-accent ml-auto tabular-nums">{item.badge}</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
