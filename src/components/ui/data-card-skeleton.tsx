import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface DataCardSkeletonProps {
  /** Number of skeleton cards to render */
  count?: number;
  /** Layout variant */
  variant?: 'stat' | 'chart' | 'list' | 'detail';
  className?: string;
}

function StatSkeleton() {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Skeleton className="h-7 w-7 rounded-md" />
          <Skeleton className="h-3 w-16" />
        </div>
        <Skeleton className="h-7 w-20 mb-1" />
        <Skeleton className="h-3 w-12" />
      </CardContent>
    </Card>
  );
}

function ChartSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-48" />
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-2 h-40">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton
              key={i}
              className="flex-1 rounded-t-sm"
              style={{ height: `${30 + Math.random() * 70}%` }}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ListSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <Skeleton className="h-4 w-36" />
      </CardHeader>
      <CardContent className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-8 w-8 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-2.5 w-1/2" />
            </div>
            <Skeleton className="h-5 w-14 rounded-full" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function DetailSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
        <Skeleton className="h-3 w-2/3" />
        <div className="flex gap-2 mt-4">
          <Skeleton className="h-8 w-20 rounded-md" />
          <Skeleton className="h-8 w-20 rounded-md" />
        </div>
      </CardContent>
    </Card>
  );
}

const skeletonMap = {
  stat: StatSkeleton,
  chart: ChartSkeleton,
  list: ListSkeleton,
  detail: DetailSkeleton,
};

export function DataCardSkeleton({ count = 1, variant = 'stat', className }: DataCardSkeletonProps) {
  const SkeletonComponent = skeletonMap[variant];

  return (
    <div className={cn(
      variant === 'stat' && "grid grid-cols-2 lg:grid-cols-4 gap-3",
      (variant === 'chart' || variant === 'list') && "grid grid-cols-1 md:grid-cols-2 gap-4",
      variant === 'detail' && "space-y-4",
      className
    )}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonComponent key={i} />
      ))}
    </div>
  );
}
