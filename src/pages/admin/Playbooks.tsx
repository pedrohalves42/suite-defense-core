import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertTriangle,
  Bell,
  BookOpen,
  CheckCircle2,
  Clock,
  History,
  Lock,
  Play,
  Shield,
  Zap,
  Info,
  Eye,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  usePlaybooks,
  usePendingPlaybookExecutions,
  usePlaybookExecutionHistory,
  useTogglePlaybook,
  useTriggerManualPlaybook,
  PlaybookExecution,
} from '@/hooks/usePlaybooks';
import { PlaybookRecommendation } from '@/components/admin/PlaybookRecommendation';
import { formatBrazil } from '@/lib/date-utils';
import { cn } from '@/lib/utils';

const TRIGGER_TYPE_LABELS: Record<string, string> = {
  agent_offline: 'Agente Offline',
  dns_blocked: 'DNS Bloqueado',
  job_failed: 'Job Falhou',
  integrity_low: 'Integridade Baixa',
  manual: 'Manual',
  suspicious_web_activity: 'Navegação Suspeita',
  vulnerability_critical: 'Vulnerabilidade Crítica',
  vulnerability_high: 'Vulnerabilidade Alta',
  multiple_malicious_access: 'Múltiplos Acessos Maliciosos',
  suspicious_process: 'Processo Suspeito',
  unauthorized_service: 'Serviço Não Autorizado',
};

const TRIGGER_TYPE_ICONS: Record<string, typeof Bell> = {
  agent_offline: Clock,
  dns_blocked: Shield,
  job_failed: AlertTriangle,
  integrity_low: Lock,
  manual: Play,
  suspicious_web_activity: Shield,
  vulnerability_critical: AlertTriangle,
  vulnerability_high: AlertTriangle,
  multiple_malicious_access: Shield,
  suspicious_process: AlertTriangle,
  unauthorized_service: Lock,
};

const EXECUTION_MODE_LABELS: Record<string, { label: string; color: string; description: string }> = {
  assistive: { 
    label: 'Assistivo', 
    color: 'bg-blue-500/10 text-blue-600 border-blue-500/30',
    description: 'Recomenda ações, não executa automaticamente'
  },
  semi_automatic: { 
    label: 'Semi-automático', 
    color: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30',
    description: 'Executa com aprovação prévia'
  },
  automatic: { 
    label: 'Automático', 
    color: 'bg-green-500/10 text-green-600 border-green-500/30',
    description: 'Executa automaticamente'
  },
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pendente', color: 'bg-yellow-500' },
  in_progress: { label: 'Em Execução', color: 'bg-blue-500' },
  completed: { label: 'Concluído', color: 'bg-green-500' },
  failed: { label: 'Falhou', color: 'bg-red-500' },
  cancelled: { label: 'Cancelado', color: 'bg-gray-500' },
  ignored: { label: 'Ignorado', color: 'bg-muted-foreground' },
};

// Helper to calculate playbook metrics from history
const calculatePlaybookMetrics = (
  playbookId: string, 
  executions: PlaybookExecution[] | undefined
): { successRate: number; avgExecutionMs: number | null; trend: 'up' | 'down' | 'stable' } => {
  if (!executions || executions.length === 0) {
    return { successRate: 0, avgExecutionMs: null, trend: 'stable' };
  }
  
  const playbookExecutions = executions.filter(e => e.playbook_id === playbookId).slice(0, 30);
  if (playbookExecutions.length === 0) {
    return { successRate: 0, avgExecutionMs: null, trend: 'stable' };
  }
  
  const completed = playbookExecutions.filter(e => e.status === 'completed').length;
  const failed = playbookExecutions.filter(e => e.status === 'failed').length;
  const total = completed + failed;
  const successRate = total > 0 ? Math.round((completed / total) * 100) : 0;
  
  // Calculate avg execution time if available
  const executionTimes = playbookExecutions
    .filter(e => e.completed_at && e.triggered_at)
    .map(e => new Date(e.completed_at!).getTime() - new Date(e.triggered_at).getTime());
  const avgExecutionMs = executionTimes.length > 0 
    ? Math.round(executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length)
    : null;
  
  // Calculate trend (compare first half vs second half)
  const halfIdx = Math.floor(playbookExecutions.length / 2);
  if (halfIdx > 0) {
    const recentHalf = playbookExecutions.slice(0, halfIdx);
    const olderHalf = playbookExecutions.slice(halfIdx);
    const recentSuccess = recentHalf.filter(e => e.status === 'completed').length / recentHalf.length;
    const olderSuccess = olderHalf.filter(e => e.status === 'completed').length / olderHalf.length;
    if (recentSuccess > olderSuccess + 0.1) return { successRate, avgExecutionMs, trend: 'up' };
    if (recentSuccess < olderSuccess - 0.1) return { successRate, avgExecutionMs, trend: 'down' };
  }
  
  return { successRate, avgExecutionMs, trend: 'stable' };
};

export default function Playbooks() {
  const [activeTab, setActiveTab] = useState('pending');
  
  const { data: playbooks, isLoading: loadingPlaybooks } = usePlaybooks();
  const { data: pendingExecutions, isLoading: loadingPending, refetch: refetchPending } = usePendingPlaybookExecutions();
  const { data: historyExecutions, isLoading: loadingHistory } = usePlaybookExecutionHistory(100);
  
  const togglePlaybook = useTogglePlaybook();
  const triggerManual = useTriggerManualPlaybook();

  const pendingCount = pendingExecutions?.length || 0;
  const manualPlaybooks = playbooks?.filter(p => p.trigger_type === 'manual') || [];

  return (
    <div className="p-6">
      
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
              <BookOpen className="h-8 w-8 text-primary" />
              Playbooks de Resposta
            </h1>
            <p className="text-muted-foreground mt-1">
              Ações automáticas de resposta a incidentes de segurança
            </p>
          </div>
          {pendingCount > 0 && (
            <Badge variant="destructive" className="text-lg px-4 py-2">
              {pendingCount} {pendingCount === 1 ? 'pendente' : 'pendentes'}
            </Badge>
          )}
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3 max-w-md">
            <TabsTrigger value="pending" className="relative">
              <Bell className="h-4 w-4 mr-2" />
              Pendentes
              {pendingCount > 0 && (
                <Badge variant="destructive" className="ml-2 h-5 min-w-5 text-xs">
                  {pendingCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="playbooks">
              <Zap className="h-4 w-4 mr-2" />
              Playbooks
            </TabsTrigger>
            <TabsTrigger value="history">
              <History className="h-4 w-4 mr-2" />
              Histórico
            </TabsTrigger>
          </TabsList>

          {/* Tab: Pendentes */}
          <TabsContent value="pending" className="mt-6">
            {loadingPending ? (
              <div className="space-y-4">
                <Skeleton className="h-40 w-full" />
                <Skeleton className="h-40 w-full" />
              </div>
            ) : pendingCount === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="rounded-full bg-green-500/10 p-4 mb-4">
                    <CheckCircle2 className="h-8 w-8 text-green-500" />
                  </div>
                  <h3 className="text-lg font-semibold">Nenhuma ação pendente</h3>
                  <p className="text-muted-foreground mt-1 max-w-md">
                    Todas as recomendações de segurança foram processadas. 
                    O sistema continuará monitorando e alertará quando necessário.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {pendingExecutions?.map((execution) => (
                  <PlaybookRecommendation
                    key={execution.id}
                    execution={execution}
                    onExecuted={() => refetchPending()}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* Tab: Playbooks */}
          <TabsContent value="playbooks" className="mt-6 space-y-4">
            {/* Non-destructive notice */}
            <Alert className="bg-blue-500/10 border-blue-500/30">
              <Eye className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-blue-700 dark:text-blue-400">
                <strong>Modo Assistivo:</strong> Estes playbooks NÃO executam ações destrutivas automaticamente. 
                Eles recomendam ações que você pode aprovar, executar ou ignorar com segurança.
              </AlertDescription>
            </Alert>
            
            <div className="grid gap-4 md:grid-cols-2">
              {loadingPlaybooks ? (
                <>
                  <Skeleton className="h-48 w-full" />
                  <Skeleton className="h-48 w-full" />
                  <Skeleton className="h-48 w-full" />
                </>
              ) : (
                playbooks?.map((playbook) => {
                  const Icon = TRIGGER_TYPE_ICONS[playbook.trigger_type] || Zap;
                  const isManual = playbook.trigger_type === 'manual';

                  return (
                    <Card key={playbook.id} className={cn(
                      'transition-all',
                      !playbook.is_enabled && 'opacity-50'
                    )}>
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              'rounded-full p-2',
                              playbook.severity === 'critical' && 'bg-red-500/20',
                              playbook.severity === 'high' && 'bg-orange-500/20',
                              playbook.severity === 'medium' && 'bg-yellow-500/20',
                              playbook.severity === 'low' && 'bg-blue-500/20',
                            )}>
                              <Icon className={cn(
                                'h-5 w-5',
                                playbook.severity === 'critical' && 'text-red-500',
                                playbook.severity === 'high' && 'text-orange-500',
                                playbook.severity === 'medium' && 'text-yellow-500',
                                playbook.severity === 'low' && 'text-blue-500',
                              )} />
                            </div>
                            <div>
                              <CardTitle className="text-base flex items-center gap-2">
                                {playbook.name}
                                {playbook.is_system && (
                                  <Badge variant="secondary" className="text-xs">
                                    Sistema
                                  </Badge>
                                )}
                              </CardTitle>
                              <CardDescription className="mt-0.5">
                                {TRIGGER_TYPE_LABELS[playbook.trigger_type]}
                              </CardDescription>
                            </div>
                          </div>
                          <Switch
                            checked={playbook.is_enabled}
                            onCheckedChange={(checked) => 
                              togglePlaybook.mutate({ playbookId: playbook.id, enabled: checked })
                            }
                            disabled={togglePlaybook.isPending}
                          />
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <p className="text-sm text-muted-foreground mb-3">
                          {playbook.description}
                        </p>
                        <div className="flex items-center justify-between">
                        <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline">
                              {playbook.actions?.length || 0} ações
                            </Badge>
                            {/* Execution Mode Badge */}
                            {(() => {
                              const mode = (playbook as never).execution_mode || 'assistive';
                              const modeInfo = EXECUTION_MODE_LABELS[mode] || EXECUTION_MODE_LABELS.assistive;
                              return (
                                <Badge variant="outline" className={modeInfo.color} title={modeInfo.description}>
                                  {modeInfo.label}
                                </Badge>
                              );
                            })()}
                            {playbook.require_approval && (
                              <Badge variant="outline" className="text-yellow-500 border-yellow-500/30">
                                Requer aprovação
                              </Badge>
                            )}
                            {/* Metrics: Success Rate */}
                            {(() => {
                              const metrics = calculatePlaybookMetrics(playbook.id, historyExecutions);
                              if (metrics.successRate === 0 && !metrics.avgExecutionMs) return null;
                              return (
                                <Badge 
                                  variant="outline" 
                                  className={cn(
                                    "gap-1",
                                    metrics.successRate >= 80 && "border-green-500/30 text-green-600",
                                    metrics.successRate >= 50 && metrics.successRate < 80 && "border-yellow-500/30 text-yellow-600",
                                    metrics.successRate < 50 && "border-red-500/30 text-red-600"
                                  )}
                                  title={`Taxa de sucesso: ${metrics.successRate}%${metrics.avgExecutionMs ? ` | Tempo médio: ${Math.round(metrics.avgExecutionMs / 1000)}s` : ''}`}
                                >
                                  {metrics.trend === 'up' && '↑'}
                                  {metrics.trend === 'down' && '↓'}
                                  {metrics.successRate}% sucesso
                                </Badge>
                              );
                            })()}
                          </div>
                          {isManual && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => triggerManual.mutate({ playbookId: playbook.id })}
                              disabled={triggerManual.isPending || !playbook.is_enabled}
                            >
                              <Play className="h-3 w-3 mr-1" />
                              Executar
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          </TabsContent>

          {/* Tab: Histórico */}
          <TabsContent value="history" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <History className="h-5 w-5" />
                  Histórico de Execuções
                </CardTitle>
                <CardDescription>
                  Últimas 100 execuções de playbooks
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingHistory ? (
                  <div className="space-y-2">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                  </div>
                ) : historyExecutions?.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Nenhuma execução registrada
                  </div>
                ) : (
                  <ScrollArea className="h-[500px]">
                    <div className="space-y-2">
                      {historyExecutions?.map((execution) => (
                        <ExecutionHistoryItem key={execution.id} execution={execution} />
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function ExecutionHistoryItem({ execution }: { execution: PlaybookExecution }) {
  const status = STATUS_LABELS[execution.status] || STATUS_LABELS.pending;
  const actionsExecuted = execution.actions_taken?.length || 0;
  const actionsSucceeded = execution.actions_taken?.filter(a => a.success).length || 0;

  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
      <div className="flex items-center gap-3">
        <div className={cn('w-2 h-2 rounded-full', status.color)} />
        <div>
          <p className="text-sm font-medium">
            {execution.playbook?.name || 'Playbook removido'}
          </p>
          <p className="text-xs text-muted-foreground">
            {execution.agent?.agent_name || 'Sistema'} • {' '}
            {formatBrazil(execution.triggered_at, "dd/MM/yyyy HH:mm")}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {actionsExecuted > 0 && (
          <span className="text-xs text-muted-foreground">
            {actionsSucceeded}/{actionsExecuted} ações
          </span>
        )}
        <Badge variant="outline" className="text-xs">
          {status.label}
        </Badge>
        {execution.ignore_reason && (
          <span className="text-xs text-muted-foreground max-w-[200px] truncate" title={execution.ignore_reason}>
            {execution.ignore_reason}
          </span>
        )}
      </div>
    </div>
  );
}
