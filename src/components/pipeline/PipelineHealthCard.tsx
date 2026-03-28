import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatBrazilDateTime, formatRelativeTime } from '@/lib/date-utils';
import { cn } from '@/lib/utils';
import { usePipelineHealth, type PipelineFreshnessStatus, type PipelineSignalHealth } from '@/hooks/usePipelineHealth';
import { Activity, Clock, HelpCircle, ShieldCheck } from 'lucide-react';

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

function labelForStatus(status: PipelineFreshnessStatus) {
  switch (status) {
    case 'fresh':
      return 'Atualizado';
    case 'stale':
      return 'Desatualizando';
    case 'critical':
      return 'Crítico';
    case 'disabled':
      return 'Desativado';
    case 'no_data':
      return 'Sem dados';
    default:
      return 'Indeterminado';
  }
}

function SignalRow({ signal }: { signal: PipelineSignalHealth }) {
  let detail: string;
  if (signal.status === 'disabled') {
    detail = 'Recurso desativado nas configurações do tenant';
  } else if (signal.status === 'no_data') {
    detail = 'Nenhum registro encontrado ainda';
  } else if (signal.last_seen_at) {
    detail = `Último: ${formatRelativeTime(signal.last_seen_at)} (${formatBrazilDateTime(signal.last_seen_at, 'short')})`;
  } else {
    detail = 'Sem evidência ainda';
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border bg-card p-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{signal.label}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
      <Badge variant={badgeVariantForStatus(signal.status)} className="shrink-0">
        {labelForStatus(signal.status)}
      </Badge>
    </div>
  );
}

export function PipelineHealthCard({
  tenantId,
  tenantLoading,
  className,
}: {
  tenantId?: string;
  tenantLoading?: boolean;
  className?: string;
}) {
  const { data, isLoading, isError, error } = usePipelineHealth(tenantId, {
    enabled: !tenantLoading && !!tenantId,
    refetchIntervalMs: 600_000,
  });

  const overall = data?.overall_status ?? 'unknown';

  return (
    <Card
      className={cn(
        'border',
        overall === 'critical' && 'border-destructive/40',
        overall === 'stale' && 'border-warning/40',
        className
      )}
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          Saúde do Pipeline (Anti-silêncio)
          <span className="ml-auto">
            <Badge variant={badgeVariantForStatus(overall)}>
              {labelForStatus(overall)}
            </Badge>
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {tenantLoading && (
          <div className="flex items-start gap-2 rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">
            <Clock className="h-4 w-4 mt-0.5" />
            <div>
              <p className="font-medium text-foreground">Sincronizando empresa…</p>
              <p className="text-xs text-muted-foreground">
                Estamos atualizando sua sessão para isolar os dados corretamente. KPIs podem aparecer vazios durante esse processo.
              </p>
            </div>
          </div>
        )}

        {isLoading && (
          <div className="grid gap-2">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        )}

        {!tenantLoading && isError && (
          <div className="flex items-start gap-2 rounded-md border bg-destructive/5 p-3 text-sm">
            <HelpCircle className="h-4 w-4 mt-0.5 text-destructive" />
            <div>
              <p className="font-medium text-destructive">Falha ao ler saúde do pipeline</p>
              <p className="text-xs text-muted-foreground">{(error as Error)?.message ?? 'Erro desconhecido'}</p>
            </div>
          </div>
        )}

        {!tenantLoading && !isLoading && data && (
          <div className="grid gap-2">
            {Object.values(data.signals).map((signal) => (
              <SignalRow key={signal.key} signal={signal} />
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" />
          <span>
            Heartbeats: OK &lt; 10min · Jobs: OK &lt; 2h · Web: OK &lt; 1h · DNS: verifica se habilitado
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
