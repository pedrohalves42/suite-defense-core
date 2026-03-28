import { useState } from 'react';
import { 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  RefreshCw, 
  Eye,
  Activity,
  Zap,
  Server,
  ChevronDown,
  ChevronUp,
  XCircle
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Collapsible, 
  CollapsibleContent, 
  CollapsibleTrigger 
} from '@/components/ui/collapsible';
import {
  useUnhealthyAgents,
  useNonExecutionAlerts,
  useResolveAlert,
  useResolveAllAlerts,
  useHealthStatusLabel,
  type AgentExecutionHealth,
  type NonExecutionAlert,
} from '@/hooks/useAgentHealthAlerts';
import { formatDistanceToNow, ptBR } from '@/lib/date-utils';
import { Link } from 'react-router-dom';
import { HumanizedAlertCard } from '@/components/admin/HumanizedAlertCard';

function getSeverityIcon(severity: string) {
  switch (severity) {
    case 'critical':
      return <XCircle className="h-4 w-4 text-red-500" />;
    case 'high':
      return <AlertTriangle className="h-4 w-4 text-orange-500" />;
    case 'medium':
      return <AlertTriangle className="h-4 w-4 text-amber-500" />;
    default:
      return <Activity className="h-4 w-4 text-blue-500" />;
  }
}

function getSeverityBadgeVariant(severity: string) {
  switch (severity) {
    case 'critical':
      return 'destructive';
    case 'high':
      return 'destructive';
    case 'medium':
      return 'secondary';
    default:
      return 'outline';
  }
}

function getHealthStatusIcon(status: string) {
  switch (status) {
    case 'not_polling_jobs':
      return <Clock className="h-4 w-4 text-amber-500" />;
    case 'not_executing_jobs':
      return <Zap className="h-4 w-4 text-orange-500" />;
    case 'execution_stale':
      return <Activity className="h-4 w-4 text-red-500" />;
    case 'safe_mode':
      return <Server className="h-4 w-4 text-blue-500" />;
    default:
      return <AlertTriangle className="h-4 w-4 text-muted-foreground" />;
  }
}

interface AgentHealthCardProps {
  agent: AgentExecutionHealth;
}

function AgentHealthCard({ agent }: AgentHealthCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const statusLabel = useHealthStatusLabel(agent.health_status);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="border-l-4 border-l-amber-500" data-testid={`health-alert-${agent.agent_id}`}>
        <CardHeader className="py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {getHealthStatusIcon(agent.health_status)}
              <div>
                <CardTitle className="text-base font-medium">
                  {agent.agent_name}
                </CardTitle>
                <CardDescription className="text-xs">
                  {agent.health_description}
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={getSeverityBadgeVariant(agent.severity) as "default" | "destructive" | "outline" | "secondary"}>
                {agent.severity}
              </Badge>
              <Badge variant="outline">{statusLabel}</Badge>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm">
                  {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </CollapsibleTrigger>
            </div>
          </div>
        </CardHeader>
        
        <CollapsibleContent>
          <CardContent className="pt-0">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Último Heartbeat:</span>
                <p className="font-medium">
                  {agent.minutes_since_heartbeat !== null 
                    ? `${agent.minutes_since_heartbeat} min atrás`
                    : 'Nunca'}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Última Execução:</span>
                <p className="font-medium">
                  {agent.minutes_since_execution !== null 
                    ? `${agent.minutes_since_execution} min atrás`
                    : 'Nunca'}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Jobs Queued (+1h):</span>
                <p className="font-medium text-amber-500">
                  {agent.stale_queued_jobs}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Jobs Delivered (+30m):</span>
                <p className="font-medium text-orange-500">
                  {agent.stale_delivered_jobs}
                </p>
              </div>
            </div>
            
            <div className="flex gap-2 mt-4">
              <Button asChild size="sm" variant="outline">
                <Link to={`/admin/troubleshooting?agent=${agent.agent_name}`}>
                  <Eye className="h-4 w-4 mr-1" />
                  Diagnosticar
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to={`/admin/agents?id=${agent.agent_id}`}>
                  <Server className="h-4 w-4 mr-1" />
                  Ver Agente
                </Link>
              </Button>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

interface AlertCardProps {
  alert: NonExecutionAlert;
  onResolve: () => void;
  isResolving: boolean;
}

function AlertCard({ alert, onResolve, isResolving }: AlertCardProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="border-l-4 border-l-orange-500" data-testid={`alert-${alert.id}`}>
        <CardHeader className="py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {getSeverityIcon(alert.severity)}
              <div>
                <CardTitle className="text-base font-medium">
                  {alert.title || alert.message}
                </CardTitle>
                <CardDescription className="text-xs">
                  {formatDistanceToNow(new Date(alert.created_at), { 
                    addSuffix: true, 
                    locale: ptBR 
                  })}
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={getSeverityBadgeVariant(alert.severity) as "default" | "destructive" | "outline" | "secondary"}>
                {alert.severity}
              </Badge>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={onResolve}
                disabled={isResolving}
              >
                <CheckCircle2 className="h-4 w-4 mr-1" />
                Resolver
              </Button>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm">
                  {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </CollapsibleTrigger>
            </div>
          </div>
        </CardHeader>
        
        <CollapsibleContent>
          <CardContent className="pt-0">
            {alert.details && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Status:</span>
                  <p className="font-medium">{alert.details.health_status || '-'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Jobs Queued:</span>
                  <p className="font-medium text-amber-500">
                    {alert.details.stale_queued_jobs ?? '-'}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Jobs Delivered:</span>
                  <p className="font-medium text-orange-500">
                    {alert.details.stale_delivered_jobs ?? '-'}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Detectado:</span>
                  <p className="font-medium">
                    {alert.details.detected_at 
                      ? formatDistanceToNow(new Date(alert.details.detected_at), { 
                          addSuffix: true, 
                          locale: ptBR 
                        })
                      : '-'}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

export function AgentHealthAlerts() {
  const { data: unhealthyAgents, isLoading: loadingAgents, refetch: refetchAgents } = useUnhealthyAgents();
  const { data: alerts, isLoading: loadingAlerts, refetch: refetchAlerts } = useNonExecutionAlerts();
  const resolveAlert = useResolveAlert();
  const resolveAllAlerts = useResolveAllAlerts();

  const handleRefresh = () => {
    refetchAgents();
    refetchAlerts();
  };

  const handleResolveAll = () => {
    if (alerts && alerts.length > 0) {
      // Filtrar alertas não-críticos para resolução em lote
      const nonCriticalAlerts = alerts.filter(a => a.severity !== 'critical');
      if (nonCriticalAlerts.length > 0) {
        resolveAllAlerts.mutate({ alertIds: nonCriticalAlerts.map(a => a.id) });
      }
    }
  };

  const isLoading = loadingAgents || loadingAlerts;
  const hasProblems = (unhealthyAgents?.length ?? 0) > 0 || (alerts?.length ?? 0) > 0;

  // Filtrar agentes com problemas reais (excluir offline e never_connected)
  const executionProblems = unhealthyAgents?.filter(
    a => ['not_polling_jobs', 'not_executing_jobs', 'execution_stale'].includes(a.health_status)
  ) ?? [];

  return (
    <div className="space-y-6" data-testid="agent-health-alerts">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Watchdog de Execução
          </h3>
          <p className="text-sm text-muted-foreground">
            Monitora agentes que estão online mas não executando jobs
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleRefresh}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          {(alerts?.length ?? 0) > 0 && (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleResolveAll}
              disabled={resolveAllAlerts.isPending}
            >
              <CheckCircle2 className="h-4 w-4 mr-1" />
              Resolver Todos ({alerts?.length})
            </Button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Problemas de Execução</CardDescription>
            <CardTitle className="text-2xl">
              {isLoading ? <Skeleton className="h-8 w-12" /> : executionProblems.length}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Alertas Pendentes</CardDescription>
            <CardTitle className="text-2xl">
              {isLoading ? <Skeleton className="h-8 w-12" /> : alerts?.length ?? 0}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Severidade Crítica</CardDescription>
            <CardTitle className="text-2xl text-red-500">
              {isLoading ? (
                <Skeleton className="h-8 w-12" />
              ) : (
                executionProblems.filter(a => a.severity === 'critical').length
              )}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* No Problems State */}
      {!isLoading && !hasProblems && (
        <Card className="border-green-500/50 bg-green-500/5">
          <CardContent className="py-8 text-center">
            <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-3" />
            <h4 className="text-lg font-medium">Todos os agentes estão saudáveis</h4>
            <p className="text-sm text-muted-foreground">
              Nenhum problema de execução detectado
            </p>
          </CardContent>
        </Card>
      )}

      {/* Execution Problems */}
      {executionProblems.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-muted-foreground">
            Agentes com Problemas de Execução ({executionProblems.length})
          </h4>
          {executionProblems.map((agent) => (
            <AgentHealthCard key={agent.agent_id} agent={agent} />
          ))}
        </div>
      )}

      {/* Pending Alerts - usando HumanizedAlertCard */}
      {(alerts?.length ?? 0) > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-muted-foreground">
            Alertas Pendentes ({alerts?.length})
          </h4>
          {alerts?.map((alert) => (
            <HumanizedAlertCard 
              key={alert.id}
              alertType={alert.alert_type || 'execution_stale'}
              agentName={alert.title?.replace('Agent ', '') || undefined}
              timestamp={alert.created_at}
              onAction={() => resolveAlert.mutate({ alertId: alert.id })}
              actionLabel="Resolver"
              compact
            />
          ))}
        </div>
      )}
    </div>
  );
}
