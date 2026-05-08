import { cn } from "@/lib/utils";

export const DashboardSkeleton = () => {
  return (
    <div className="min-h-screen bg-[#020203] flex relative overflow-hidden">
      {/* Background glow simulation */}
      <div className="absolute top-[10%] left-[20%] w-[40%] h-[40%] bg-cta-positive/5 rounded-full blur-[140px] pointer-events-none" />

      {/* Sidebar Skeleton */}
      <div className="hidden md:flex w-56 flex-col border-r border-white/5 p-6 space-y-10 animate-pulse relative z-10">
        <div className="h-10 w-32 bg-white/5 rounded-2xl" />
        <div className="space-y-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-11 w-full bg-white/5 rounded-2xl" />
          ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col relative z-10">
        {/* TopBar Skeleton */}
        <div className="h-16 border-b border-white/5 px-10 flex items-center justify-between animate-pulse bg-[#020203]/50 backdrop-blur-xl">
          <div className="h-6 w-40 bg-white/5 rounded-lg" />
          <div className="flex items-center gap-4">
            <div className="h-10 w-10 bg-white/5 rounded-2xl" />
            <div className="h-10 w-10 bg-white/5 rounded-full" />
          </div>
        </div>

        {/* Content Skeleton */}
        <main className="p-10 space-y-10 animate-pulse overflow-hidden">
          {/* Header Card Skeleton */}
          <div className="h-44 w-full bg-white/5 rounded-[2.5rem] border border-white/5" />

          {/* KPI Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-44 bg-white/5 rounded-[2rem] border border-white/5" />
            ))}
          </div>

          {/* Lower Sections */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 h-[450px] bg-white/5 rounded-[2.5rem] border border-white/5" />
            <div className="h-[450px] bg-white/5 rounded-[2.5rem] border border-white/5" />
          </div>
        </main>
      </div>
    </div>
  );
};

