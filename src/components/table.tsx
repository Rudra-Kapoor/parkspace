import type { ReactNode } from 'react';
import { cn } from './ui';

/**
 * Table primitives for the dashboard and admin surfaces.
 *
 * Every wide table on a phone has to do something, and the two choices are
 * reflow into cards or scroll inside its own container. These scroll, because
 * an admin comparing rows needs the columns to stay in line, and a table that
 * makes the whole page scroll sideways is the worst of both.
 */

export function TableShell({
  children,
  caption,
  minWidth = '40rem',
}: {
  children: ReactNode;
  caption: string;
  minWidth?: string;
}) {
  return (
    <div className="ps-scroll-x">
      <table className="w-full text-sm" style={{ minWidth }}>
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  );
}

export function Th({
  children,
  align,
  className,
}: {
  children: ReactNode;
  align?: 'right';
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={cn(
        'whitespace-nowrap px-3 py-2 text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]',
        align === 'right' ? 'text-right' : 'text-left',
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align,
  className,
}: {
  children: ReactNode;
  align?: 'right';
  className?: string;
}) {
  return (
    <td
      className={cn(
        'px-3 py-2.5 align-top',
        align === 'right' && 'text-right tabular-nums',
        className,
      )}
    >
      {children}
    </td>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return (
    <thead>
      <tr className="border-b bg-[var(--surface-sunken)]">{children}</tr>
    </thead>
  );
}

export function Tr({ children }: { children: ReactNode }) {
  return <tr className="border-b last:border-b-0 align-top">{children}</tr>;
}
