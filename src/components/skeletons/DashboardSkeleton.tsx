import { cn } from "@/lib/utils";

export const DashboardSkeleton = () => {
  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar Skeleton */}
      <div className="hidden md:flex w-56 flex-col border-r border-white/5 p-6 space-y-8 animate-pulse">
        <div className="h-8 w-32 bg-white/5 rounded-lg" />
        <div className="space-y-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-10 w-full bg-white/5 rounded-xl" />
          ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        {/* TopBar Skeleton */}
        <div className="h-16 border-b border-white/5 px-10 flex items-center justify-between animate-pulse">
          <div className="h-6 w-40 bg-white/5 rounded-lg" />
          <div className="h-10 w-10 bg-white/5 rounded-full" />
        </div>

        {/* Content Skeleton */}
        <main className="p-10 space-y-10 animate-pulse">
          <div className="space-y-4">
            <div className="h-10 w-64 bg-white/5 rounded-lg" />
            <div className="h-4 w-96 bg-white/5 rounded-lg" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-32 bg-white/5 rounded-[2rem] border border-white/5" />
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 h-[400px] bg-white/5 rounded-[2rem] border border-white/5" />
            <div className="h-[400px] bg-white/5 rounded-[2rem] border border-white/5" />
          </div>
        </main>
      </div>
    </div>
  );
};
