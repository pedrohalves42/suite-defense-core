import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function SectionSkeleton() {
  return (
    <div className="py-24 space-y-12 max-w-7xl mx-auto px-6 lg:px-8">
      <div className="flex flex-col items-center space-y-4 animate-pulse">
        <div className="h-8 w-40 rounded-full bg-cta-positive/10 border border-cta-positive/10" />
        <div className="h-16 w-3/4 max-w-2xl rounded-2xl bg-white/[0.03]" />
        <div className="h-6 w-1/2 max-w-lg rounded-xl bg-white/[0.02]" />
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {[1, 2, 3].map((i) => (
          <div 
            key={i} 
            className={cn(
              "h-80 w-full rounded-[2.5rem] bg-white/[0.03] border border-white/5 relative overflow-hidden",
              "before:absolute before:inset-0 before:bg-gradient-to-r before:from-transparent before:via-white/[0.02] before:to-transparent before:animate-shimmer"
            )}
          >
            <div className="p-10 space-y-6">
              <div className="h-16 w-16 rounded-2xl bg-cta-positive/5" />
              <div className="h-8 w-3/4 rounded-xl bg-white/[0.03]" />
              <div className="space-y-3">
                <div className="h-4 w-full rounded-lg bg-white/[0.02]" />
                <div className="h-4 w-5/6 rounded-lg bg-white/[0.02]" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
