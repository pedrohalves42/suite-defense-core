import { cn } from '@/lib/utils';

interface FilterPillProps {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  count: number;
}

export function FilterPill({ children, active, onClick, count }: FilterPillProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all",
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "bg-muted/50 text-muted-foreground hover:bg-muted"
      )}
    >
      {children}
      <span className={cn(
        "text-[9px] px-1.5 py-0 rounded-full min-w-[18px] text-center",
        active ? "bg-primary-foreground/20" : "bg-background/80"
      )}>
        {count}
      </span>
    </button>
  );
}
