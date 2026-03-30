/**
 * LoadingGrid — skeleton placeholder for page-level loading states.
 * Replaces repeated Skeleton grid patterns.
 */

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface LoadingGridProps {
  /** Number of skeleton cards to show (default: 4) */
  cards?: number;
  /** Height of the skeleton cards (default: 'h-24') */
  cardHeight?: string;
  /** Show a header skeleton (default: true) */
  showHeader?: boolean;
  /** Show a large content skeleton below cards (default: false) */
  showContent?: boolean;
  className?: string;
}

export function LoadingGrid({
  cards = 4,
  cardHeight = 'h-24',
  showHeader = true,
  showContent = false,
  className,
}: LoadingGridProps) {
  return (
    <div className={cn('space-y-6 p-6', className)}>
      {showHeader && <Skeleton className="h-10 w-80" />}
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: cards }).map((_, i) => (
          <Skeleton key={i} className={cardHeight} />
        ))}
      </div>
      {showContent && <Skeleton className="h-96" />}
    </div>
  );
}
