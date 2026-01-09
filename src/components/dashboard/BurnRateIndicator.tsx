import { Flame } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getBurnRateInfo, type BurnRateInfo } from '@/hooks/useIncidentSLO';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface BurnRateIndicatorProps {
  burn1h: number;
  burn6h: number;
  burn24h: number;
  compact?: boolean;
  showLabel?: boolean;
}

/**
 * Displays burn rate values across multiple time windows
 * Color-coded based on severity thresholds
 */
export function BurnRateIndicator({
  burn1h,
  burn6h,
  burn24h,
  compact = false,
  showLabel = true,
}: BurnRateIndicatorProps) {
  const info1h = getBurnRateInfo(burn1h);
  const info6h = getBurnRateInfo(burn6h);
  const info24h = getBurnRateInfo(burn24h);

  // Get the highest severity for the main indicator
  const highestSeverity = [info1h, info6h, info24h].reduce((prev, curr) => {
    const severityOrder = ['ok', 'alert', 'warning', 'high', 'critical'];
    return severityOrder.indexOf(curr.level) > severityOrder.indexOf(prev.level) ? curr : prev;
  });

  if (compact) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn(
            "flex items-center gap-1 text-xs px-2 py-0.5 rounded-full cursor-help",
            highestSeverity.bg,
            highestSeverity.text
          )}>
            <Flame className="h-3 w-3" />
            <span className="font-mono">{burn1h.toFixed(1)}×</span>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-xs space-y-1">
            <div className="font-medium">Burn Rate</div>
            <div className="flex items-center gap-2">
              <span className={info1h.text}>1h: {burn1h.toFixed(1)}×</span>
              <span className={info6h.text}>6h: {burn6h.toFixed(1)}×</span>
              <span className={info24h.text}>24h: {burn24h.toFixed(1)}×</span>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      {showLabel && (
        <>
          <Flame className="h-3 w-3 text-orange-500" />
          <span className="text-muted-foreground">Burn Rate:</span>
        </>
      )}
      <div className="flex items-center gap-2 font-mono">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={cn("cursor-help", info1h.text)}>
              1h: {burn1h.toFixed(1)}×
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <span>Taxa de consumo do orçamento de erro na última hora</span>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <span className={cn("cursor-help", info6h.text)}>
              6h: {burn6h.toFixed(1)}×
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <span>Taxa de consumo do orçamento de erro nas últimas 6 horas</span>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <span className={cn("cursor-help", info24h.text)}>
              24h: {burn24h.toFixed(1)}×
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <span>Taxa de consumo do orçamento de erro nas últimas 24 horas</span>
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

/**
 * Simple burn rate badge for list views
 */
export function BurnRateBadge({ rate }: { rate: number }) {
  const info = getBurnRateInfo(rate);
  
  return (
    <span className={cn(
      "inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full",
      info.bg,
      info.text
    )}>
      <Flame className="h-3 w-3" />
      {rate.toFixed(1)}×
    </span>
  );
}
