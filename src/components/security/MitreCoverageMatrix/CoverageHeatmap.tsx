import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { TacticCoverage } from '@/hooks/useMitreCoverage';

interface Props {
  tactics: TacticCoverage[];
}

const formatTactic = (name: string) =>
  name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

const getHeatColor = (pct: number) => {
  if (pct >= 75) return 'bg-green-500/80 dark:bg-green-600/60';
  if (pct >= 50) return 'bg-yellow-500/80 dark:bg-yellow-600/60';
  if (pct > 0) return 'bg-orange-500/80 dark:bg-orange-600/60';
  return 'bg-red-500/80 dark:bg-red-600/60';
};

export function CoverageHeatmap({ tactics }: Props) {
  return (
    <TooltipProvider>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {tactics.map(t => (
          <Tooltip key={t.tactic}>
            <TooltipTrigger asChild>
              <div
                className={`rounded-lg p-3 cursor-default transition-colors ${getHeatColor(t.coverage_pct)}`}
              >
                <p className="text-xs font-medium text-white truncate">
                  {formatTactic(t.tactic)}
                </p>
                <p className="text-lg font-bold text-white">{t.coverage_pct}%</p>
                <p className="text-[10px] text-white/80">
                  {t.covered_techniques}/{t.total_techniques}
                </p>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p className="font-medium">{formatTactic(t.tactic)}</p>
              <p className="text-xs">
                {t.covered_techniques} de {t.total_techniques} técnicas cobertas
              </p>
              {t.uncovered_ids && t.uncovered_ids.length > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Gaps: {t.uncovered_ids.slice(0, 5).join(', ')}
                  {t.uncovered_ids.length > 5 && ` +${t.uncovered_ids.length - 5}`}
                </p>
              )}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  );
}
