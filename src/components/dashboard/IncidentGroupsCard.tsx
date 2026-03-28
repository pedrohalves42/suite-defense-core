import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  useIncidentGroupsWithSLO, 
  getBurnRateInfo,
  getOverallBurnRateStatus,
  type IncidentGroupWithSLO,
} from '@/hooks/useIncidentSLO';
import { 
  getIncidentLabel, 
  getIncidentStatus,
  getSeverityColor,
  getSeverityLabel,
} from '@/hooks/useIncidentGroups';
import { BurnRateIndicator } from './BurnRateIndicator';
import { ErrorBudgetBar } from './ErrorBudgetBar';
import { 
  AlertOctagon, 
  RefreshCw, 
  Flame, 
  Activity, 
  TrendingUp, 
  CheckCircle2,
  ChevronRight,
  Layers,
  Users,
  Server,
  Clock,
  Gauge
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';
import { formatDistanceToNow, ptBR } from '@/lib/date-utils';
import { TooltipProvider } from '@/components/ui/tooltip';

const StatusIcon = ({ status }: { status: ReturnType<typeof getIncidentStatus> }) => {
  switch (status.icon) {
    case 'flame':
      return <Flame className="h-3.5 w-3.5" />;
    case 'activity':
      return <Activity className="h-3.5 w-3.5" />;
    case 'trending-up':
      return <TrendingUp className="h-3.5 w-3.5" />;
    default:
      return <CheckCircle2 className="h-3.5 w-3.5" />;
  }
};

const SLOStatusBadge = ({ status }: { status: string }) => {
  const statusConfig: Record<string, { text: string; bg: string; label: string }> = {
    critical: { text: 'text-red-600', bg: 'bg-red-500/10', label: 'CRÍTICO' },
    high: { text: 'text-orange-600', bg: 'bg-orange-500/10', label: 'ALTO' },
    warning: { text: 'text-amber-600', bg: 'bg-amber-500/10', label: 'ATENÇÃO' },
    alert: { text: 'text-yellow-600', bg: 'bg-yellow-500/10', label: 'ALERTA' },
    ok: { text: 'text-green-600', bg: 'bg-green-500/10', label: 'OK' },
  };

  const config = statusConfig[status] || statusConfig.ok;

  return (
    <span className={cn(
      "inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded",
      config.bg,
      config.text
    )}>
      <Gauge className="h-2.5 w-2.5" />
      {config.label}
    </span>
  );
};

const IncidentRow = ({ incident }: { incident: IncidentGroupWithSLO }) => {
  const status = getIncidentStatus(incident as unknown as Parameters<typeof getIncidentStatus>[0]);
  const severityColors = getSeverityColor(incident.severity_hint);
  const label = getIncidentLabel(incident as unknown as Parameters<typeof getIncidentStatus>[0]);
  const burnRateStatus = getOverallBurnRateStatus(
    incident.burn_rate_1h,
    incident.burn_rate_6h,
    incident.burn_rate_24h
  );
  
  const statusColors = {
    red: 'text-red-600 dark:text-red-400 bg-red-500/10',
    orange: 'text-orange-600 dark:text-orange-400 bg-orange-500/10',
    amber: 'text-amber-600 dark:text-amber-400 bg-amber-500/10',
    green: 'text-green-600 dark:text-green-400 bg-green-500/10',
  };

  // Check if has SLO data
  const hasSLOData = incident.burn_rate_1h > 0 || incident.burn_rate_6h > 0 || incident.burn_rate_24h > 0;

  return (
    <div className={cn(
      "p-3 rounded-lg border transition-colors hover:bg-muted/50",
      severityColors.bg,
      incident.severity_hint === 'critical' && 'border-red-500/30',
      incident.severity_hint === 'high' && 'border-orange-500/30',
      incident.severity_hint === 'medium' && 'border-amber-500/30',
      incident.severity_hint === 'low' && 'border-blue-500/30'
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Header with severity indicator */}
          <div className="flex items-center gap-2 mb-1">
            <AlertOctagon className={cn("h-4 w-4 shrink-0", severityColors.text)} />
            <span className="font-medium text-sm truncate">{label}</span>
          </div>
          
          {/* 🔥 NEW: Burn Rate & Error Budget (ADR-034) */}
          {hasSLOData && (
            <div className="mb-2 space-y-1.5 p-2 rounded bg-background/50 border border-border/50">
              <BurnRateIndicator
                burn1h={incident.burn_rate_1h}
                burn6h={incident.burn_rate_6h}
                burn24h={incident.burn_rate_24h}
              />
              <ErrorBudgetBar
                consumed={incident.budget_consumed}
                target={incident.slo_target}
              />
            </div>
          )}

          {/* Stats row */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <Layers className="h-3 w-3" />
              <span>{incident.total_occurrences} ocorrências</span>
            </div>
            <div className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              <span>{incident.distinct_tenants} tenant{incident.distinct_tenants !== 1 ? 's' : ''}</span>
            </div>
            {incident.distinct_agents > 0 && (
              <div className="flex items-center gap-1">
                <Server className="h-3 w-3" />
                <span>{incident.distinct_agents} agente{incident.distinct_agents !== 1 ? 's' : ''}</span>
              </div>
            )}
          </div>

          {/* Time info */}
          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
            <Clock className="h-3 w-3" />
            <span>
              Primeiro: {formatDistanceToNow(new Date(incident.first_seen_at), { 
                addSuffix: true, 
                locale: ptBR 
              })}
              {' | '}
              Último: {formatDistanceToNow(new Date(incident.last_seen_at), { 
                addSuffix: true, 
                locale: ptBR 
              })}
            </span>
          </div>
        </div>

        {/* Right side: severity + status + SLO status */}
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <Badge 
            variant="outline" 
            className={cn("text-xs", severityColors.text, severityColors.border)}
          >
            {getSeverityLabel(incident.severity_hint)}
          </Badge>
          <div className={cn(
            "flex items-center gap-1 text-xs px-2 py-0.5 rounded-full",
            statusColors[status.color]
          )}>
            <StatusIcon status={status} />
            <span>{status.label}</span>
          </div>
          {hasSLOData && (
            <SLOStatusBadge status={incident.slo_status} />
          )}
        </div>
      </div>
    </div>
  );
};

export function IncidentGroupsCard() {
  const { data: incidents, isLoading, refetch } = useIncidentGroupsWithSLO(10);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-48" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const activeIncidents = incidents?.filter(i => i.is_active) || [];
  const ongoingCount = activeIncidents.filter(i => i.is_ongoing).length;
  const criticalCount = activeIncidents.filter(i => i.severity_hint === 'critical').length;
  const highBurnCount = activeIncidents.filter(i => i.burn_rate_1h >= 2).length;
  const criticalSLOCount = activeIncidents.filter(i => i.slo_status === 'critical' || i.slo_status === 'high').length;

  return (
    <TooltipProvider>
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Flame className="h-4 w-4 text-muted-foreground" />
              Incident Groups
              {activeIncidents.length > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {activeIncidents.length} ativo{activeIncidents.length !== 1 ? 's' : ''}
                </Badge>
              )}
            </CardTitle>
            <div className="flex items-center gap-2">
              {/* Quick stats badges */}
              {highBurnCount > 0 && (
                <Badge variant="outline" className="text-xs text-orange-600 border-orange-500">
                  <Flame className="h-3 w-3 mr-1" />
                  {highBurnCount} burn ≥2×
                </Badge>
              )}
              {criticalSLOCount > 0 && (
                <Badge variant="outline" className="text-xs text-red-600 border-red-500">
                  <Gauge className="h-3 w-3 mr-1" />
                  {criticalSLOCount} SLO crítico
                </Badge>
              )}
              {ongoingCount > 0 && !highBurnCount && (
                <Badge variant="outline" className="text-xs text-red-600 border-red-500">
                  <Flame className="h-3 w-3 mr-1" />
                  {ongoingCount} ongoing
                </Badge>
              )}
              {criticalCount > 0 && !criticalSLOCount && (
                <Badge variant="outline" className="text-xs text-red-600 border-red-500">
                  {criticalCount} crítico{criticalCount !== 1 ? 's' : ''}
                </Badge>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => refetch()}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {activeIncidents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <CheckCircle2 className="h-12 w-12 text-green-500 mb-3" />
              <p className="text-sm font-medium">Nenhum incidente ativo</p>
              <p className="text-xs text-muted-foreground mt-1">
                Falhas isoladas ainda não formaram padrões recorrentes
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {activeIncidents.slice(0, 5).map((incident) => (
                <IncidentRow key={incident.id} incident={incident} />
              ))}
            </div>
          )}

          {/* Link to full list */}
          {activeIncidents.length > 5 && (
            <div className="mt-4 pt-3 border-t">
              <Link 
                to="/admin/incident-groups" 
                className="flex items-center justify-center gap-1 text-sm text-primary hover:underline"
              >
                Ver todos os {activeIncidents.length} incident groups
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          )}

          {/* Info about SLO monitoring */}
          <div className="mt-4 p-2 rounded-md bg-muted/30 text-xs text-muted-foreground text-center">
            Burn Rate mede velocidade de consumo do Error Budget (≥2× = incidente ativo)
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
