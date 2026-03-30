/**
 * StatsGrid — responsive grid wrapper for metric/stats cards.
 * Replaces 56+ manual `grid grid-cols-1 md:grid-cols-X gap-4` patterns.
 */

import { cn } from '@/lib/utils';

interface StatsGridProps {
  /** Number of columns at md breakpoint (default: 4) */
  columns?: 2 | 3 | 4 | 5 | 6;
  children: React.ReactNode;
  className?: string;
}

const COL_CLASSES: Record<number, string> = {
  2: 'grid grid-cols-1 md:grid-cols-2 gap-4',
  3: 'grid grid-cols-1 md:grid-cols-3 gap-4',
  4: 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4',
  5: 'grid grid-cols-2 md:grid-cols-5 gap-4',
  6: 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4',
};

export function StatsGrid({ columns = 4, children, className }: StatsGridProps) {
  return (
    <div className={cn(COL_CLASSES[columns], className)}>
      {children}
    </div>
  );
}
