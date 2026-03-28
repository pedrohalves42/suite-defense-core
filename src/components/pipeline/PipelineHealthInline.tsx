import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/date-utils';
import { usePipelineHealth, type PipelineFreshnessStatus, type PipelineSignalKey } from '@/hooks/usePipelineHealth';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Activity, HelpCircle } from 'lucide-react';

function badgeVariantForStatus(status: PipelineFreshnessStatus) {
  switch (status) {
    case 'fresh':
      return 'success' as const;
    case 'stale':
      return 'warning' as const;
    case 'critical':
      return 'destructive' as const;
    case 'disabled':
    case 'no_data':
      return 'outline' as const;
    default:
      return 'secondary' as const;
  }
}

function compactLabel(status: PipelineFreshnessStatus) {
  switch (status) {
    case 'fresh':
      return 'OK';
    case 'stale':
      return 'Lento';
    case 'critical':
      return 'Crítico';
    case 'disabled':
      return 'Desativado';
    case 'no_data':
      return 'Sem dados';
    default:
      return 'N/D';
  }
}

export function PipelineHealthInline({
  tenantId,
  tenantLoading,
  showSignals = ['heartbeats', 'jobs', 'web_activity', 'dns_policy'],
  className,
}: {
  tenantId?: string;
  tenantLoading?: boolean;
  showSignals?: PipelineSignalKey[];
  className?: string;
}) {
  const { data, isLoading, isError } = usePipelineHealth(tenantId, {
    enabled: !tenantLoading && !!tenantId,
    refetchIntervalMs: 600_000,
  });

  const overall = data?.overall_status ?? (tenantLoading ? 'unknown' : 'unknown');

  return (
    <TooltipProvider>
      <div className={cn('flex flex-wrap items-center gap-2', className)}>
        <Badge variant={badgeVariantForStatus(overall)} className="gap-1">
          <Activity className="h-3 w-3" />
          Pipeline: {compactLabel(overall)}
        </Badge>

        {isError && (
          <Badge variant="secondary" className="gap-1">
            <HelpCircle className="h-3 w-3" />
            erro
          </Badge>
        )}

        {isLoading && !tenantLoading && (
          <Badge variant="secondary">carregando…</Badge>
        )}

        {!isLoading && data && showSignals.map((key) => {
          const s = data.signals[key];
          let tooltip: string;
          if (s.status === 'disabled') {
            tooltip = `${s.label}: recurso desativado nas configurações`;
          } else if (s.status === 'no_data') {
            tooltip = `${s.label}: nenhum registro encontrado ainda`;
          } else if (s.last_seen_at) {
            tooltip = `${s.label}: ${compactLabel(s.status)} · ${formatRelativeTime(s.last_seen_at)}`;
          } else {
            tooltip = `${s.label}: sem evidência ainda`;
          }

          return (
            <Tooltip key={key}>
              <TooltipTrigger asChild>
                <Badge variant={badgeVariantForStatus(s.status)}>
                  {s.label}: {compactLabel(s.status)}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">{tooltip}</p>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
