import { cn } from '@/lib/utils';
import { getErrorBudgetColor } from '@/hooks/useIncidentSLO';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { PieChart } from 'lucide-react';

interface ErrorBudgetBarProps {
  consumed: number;
  target?: number;
  showLabel?: boolean;
  compact?: boolean;
}

/**
 * Visual representation of error budget consumption
 * Shows a progress bar with color-coded status
 */
export function ErrorBudgetBar({
  consumed,
  target = 99.5,
  showLabel = true,
  compact = false,
}: ErrorBudgetBarProps) {
  const percent = Math.min(Math.max(consumed, 0), 100);
  const color = getErrorBudgetColor(percent);
  const remaining = 100 - percent;

  if (compact) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1.5 cursor-help">
            <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all", color)}
                style={{ width: `${percent}%` }}
              />
            </div>
            <span className="text-[10px] font-mono text-muted-foreground">
              {percent.toFixed(0)}%
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-xs">
            <div className="font-medium">Error Budget</div>
            <div>Consumido: {percent.toFixed(1)}%</div>
            <div>Restante: {remaining.toFixed(1)}%</div>
            <div className="text-muted-foreground">SLO Target: {target}%</div>
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      {showLabel && (
        <>
          <PieChart className="h-3 w-3 text-muted-foreground" />
          <span className="text-muted-foreground">Budget:</span>
        </>
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden cursor-help max-w-[120px]">
            <div
              className={cn("h-full rounded-full transition-all duration-300", color)}
              style={{ width: `${percent}%` }}
            />
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-xs">
            <div className="font-medium">Error Budget Status</div>
            <div>Consumido: {percent.toFixed(1)}%</div>
            <div>Restante: {remaining.toFixed(1)}%</div>
            <div className="text-muted-foreground mt-1">
              SLO Target: {target}%
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
      <span className="font-mono text-muted-foreground whitespace-nowrap">
        {percent.toFixed(0)}% usado
      </span>
    </div>
  );
}

/**
 * Compact badge showing budget status
 */
export function ErrorBudgetBadge({ consumed }: { consumed: number }) {
  const percent = Math.min(Math.max(consumed, 0), 100);
  const color = getErrorBudgetColor(percent);
  
  const textColor = percent >= 80 
    ? 'text-red-600 dark:text-red-400' 
    : percent >= 50 
    ? 'text-orange-600 dark:text-orange-400'
    : percent >= 30
    ? 'text-amber-600 dark:text-amber-400'
    : 'text-green-600 dark:text-green-400';

  return (
    <span className={cn(
      "inline-flex items-center gap-1 text-xs font-medium",
      textColor
    )}>
      <PieChart className="h-3 w-3" />
      {percent.toFixed(0)}%
    </span>
  );
}
