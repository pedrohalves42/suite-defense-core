import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

interface AgentMetricsBarProps {
  label: string;
  icon?: LucideIcon;
  value: number | null | undefined;
  showLabel?: boolean;
  size?: 'sm' | 'md';
  thresholds?: { warning: number; danger: number };
  suffix?: string;
}

function getColorByValue(value: number, thresholds: { warning: number; danger: number }) {
  if (value >= thresholds.danger) return 'bg-red-500';
  if (value >= thresholds.warning) return 'bg-amber-500';
  return 'bg-emerald-500';
}

function getTextColorByValue(value: number, thresholds: { warning: number; danger: number }) {
  if (value >= thresholds.danger) return 'text-red-400';
  if (value >= thresholds.warning) return 'text-amber-400';
  return 'text-emerald-400';
}

export function AgentMetricsBar({
  label,
  icon: Icon,
  value,
  showLabel = true,
  size = 'md',
  thresholds = { warning: 60, danger: 80 },
  suffix = '%',
}: AgentMetricsBarProps) {
  const displayValue = value ?? 0;
  const barColor = getColorByValue(displayValue, thresholds);
  const textColor = getTextColorByValue(displayValue, thresholds);
  
  const heightClass = size === 'sm' ? 'h-1.5' : 'h-2';
  const textClass = size === 'sm' ? 'text-xs' : 'text-sm';

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {Icon && <Icon className={cn("h-3.5 w-3.5 text-muted-foreground", size === 'sm' && "h-3 w-3")} />}
          {showLabel && (
            <span className={cn("text-muted-foreground", textClass)}>{label}</span>
          )}
        </div>
        <span className={cn("font-medium tabular-nums", textClass, textColor)}>
          {value !== null && value !== undefined ? `${Math.round(displayValue)}${suffix}` : '—'}
        </span>
      </div>
      <div className={cn("w-full bg-muted/50 rounded-full overflow-hidden", heightClass)}>
        <div
          className={cn("h-full rounded-full transition-all duration-300", barColor)}
          style={{ width: `${Math.min(100, Math.max(0, displayValue))}%` }}
        />
      </div>
    </div>
  );
}
