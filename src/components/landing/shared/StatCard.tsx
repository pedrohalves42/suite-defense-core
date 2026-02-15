import { cn } from "@/lib/utils";

interface StatCardProps {
  value: string;
  label: string;
  className?: string;
}

export function StatCard({ value, label, className }: StatCardProps) {
  return (
    <div className={cn(
      "text-center p-4 rounded-xl bg-card border border-border transition-colors hover:border-accent/30",
      className
    )}>
      <div className="text-2xl font-bold text-foreground">
        {value}
      </div>
      <div className="text-sm text-muted-foreground">
        {label}
      </div>
    </div>
  );
}
