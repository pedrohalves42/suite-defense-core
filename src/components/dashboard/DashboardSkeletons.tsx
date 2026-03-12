import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function MetricCardsSkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i} className="bg-gradient-card border-border">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-4 rounded" />
              <Skeleton className="h-3 w-20" />
            </div>
          </CardHeader>
          <CardContent>
            <Skeleton className="h-7 w-28 mb-2" />
            <Skeleton className="h-3 w-24" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function SystemBannerSkeleton() {
  return (
    <Card className="border-2 border-border">
      <CardContent className="py-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex-1">
            <div className="flex items-center gap-4 mb-3">
              <Skeleton className="h-12 w-12 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-6 w-64" />
                <Skeleton className="h-4 w-40" />
              </div>
            </div>
            <div className="space-y-2 ml-16">
              <Skeleton className="h-4 w-56" />
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-44" />
            </div>
          </div>
          <Skeleton className="h-24 w-36 rounded-xl" />
        </div>
      </CardContent>
    </Card>
  );
}

export function ChartsSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i} className="bg-gradient-card border-border">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-5 rounded" />
              <Skeleton className="h-5 w-48" />
            </div>
            <Skeleton className="h-3 w-36 mt-2" />
          </CardHeader>
          <CardContent>
            <div className="h-[250px] flex items-end gap-2 px-4">
              {Array.from({ length: 7 }).map((_, j) => (
                <Skeleton
                  key={j}
                  className="flex-1 rounded-t"
                  style={{ height: `${30 + Math.random() * 60}%` }}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function TimelineSkeleton() {
  return (
    <Card className="bg-gradient-card border-border">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-5 rounded" />
          <Skeleton className="h-5 w-52" />
        </div>
        <Skeleton className="h-3 w-48 mt-2" />
      </CardHeader>
      <CardContent className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg">
            <div className="flex items-center gap-3">
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="space-y-1">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
            <div className="text-right space-y-1">
              <Skeleton className="h-5 w-16 rounded-full ml-auto" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function TabContentSkeleton() {
  return (
    <Card className="bg-gradient-card border-border">
      <CardHeader>
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-3 w-64 mt-2" />
      </CardHeader>
      <CardContent className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between p-4 bg-secondary/30 rounded-lg">
            <div className="flex items-center gap-3 flex-1">
              <Skeleton className="h-3 w-3 rounded-full" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-5 w-40" />
                <div className="flex gap-2">
                  <Skeleton className="h-4 w-20 rounded-full" />
                  <Skeleton className="h-4 w-16 rounded-full" />
                </div>
              </div>
            </div>
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
