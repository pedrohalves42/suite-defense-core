import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatCurrency } from '@/hooks/useRiskDelta';

interface ImpactRowProps {
  label: string;
  count: number;
  value: number;
  icon: React.ReactNode;
  unitCost?: string;
}

export function ImpactRow({ label, count, value, icon, unitCost }: ImpactRowProps) {
  if (value === 0) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0 cursor-help">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {icon}
            <span className="text-xs">{label}</span>
            <Badge variant="secondary" className="text-[10px] h-4 px-1">{count}x</Badge>
          </div>
          <span className="text-xs font-semibold text-success">{formatCurrency(value)}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">
        <p className="font-semibold mb-0.5">Cálculo: {count} × {unitCost || '—'}</p>
        <p className="text-muted-foreground">= {formatCurrency(value)} em custos evitados</p>
      </TooltipContent>
    </Tooltip>
  );
}
