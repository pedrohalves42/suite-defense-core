import { cn } from '@/lib/utils';

interface MetricTileProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  color: 'green' | 'red' | 'emerald' | 'muted' | 'amber';
  pulse?: boolean;
  onClick?: () => void;
}

const VALUE_COLORS = {
  green: 'text-success', red: 'text-destructive',
  emerald: 'text-success', muted: 'text-foreground', amber: 'text-warning',
};

const BG_ACCENTS = {
  green: 'bg-success/5 border-success/15', red: 'bg-destructive/5 border-destructive/15',
  emerald: 'bg-success/5 border-success/15', muted: 'bg-muted/30 border-border/40',
  amber: 'bg-warning/5 border-warning/15',
};

export function MetricTile({ icon, label, value, sub, color, pulse, onClick }: MetricTileProps) {
  return (
    <div
      className={cn(
        "relative p-2.5 rounded-xl border backdrop-blur-sm",
        BG_ACCENTS[color],
        onClick && "cursor-pointer hover:brightness-110 hover:scale-[1.02] transition-all duration-200"
      )}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); } : undefined}
    >
      {pulse && (
        <span className="absolute top-2 right-2 flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-60" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-success" />
        </span>
      )}
      <div className="flex items-center gap-1 mb-1">
        <span className="text-muted-foreground">{icon}</span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium truncate">{label}</span>
      </div>
      <p className={cn("text-lg font-bold leading-none", VALUE_COLORS[color])}>{value}</p>
      <p className="text-[10px] text-muted-foreground/70 mt-0.5 truncate">{sub}</p>
    </div>
  );
}
