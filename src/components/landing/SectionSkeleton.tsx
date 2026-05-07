import { Skeleton } from "@/components/ui/skeleton";

export function SectionSkeleton() {
  return (
    <div className="py-24 space-y-8 max-w-7xl mx-auto px-4">
      <div className="flex flex-col items-center space-y-4">
        <Skeleton className="h-8 w-48 rounded-full" />
        <Skeleton className="h-12 w-3/4 max-w-xl" />
        <Skeleton className="h-6 w-1/2 max-w-md" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-64 w-full rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
