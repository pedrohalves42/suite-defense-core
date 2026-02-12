import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Activity, AlertCircle, CheckCircle, Clock, Cog, Cpu, HardDrive, MemoryStick, Monitor, Search, XCircle, RefreshCw, Wifi, WifiOff, AlertTriangle, ChevronDown } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';
import { getOsDisplayName, getOsIcon } from '@/lib/os-utils';
import { formatBrazilDateTime } from '@/lib/date-utils';
import { cn } from '@/lib/utils';
import { useTenant } from '@/hooks/useTenant';
import { prepareJobForInsert } from '@/lib/job-utils';
import { AgentVersionStatus } from '@/components/monitoring/AgentVersionStatus';
import { OrphanedJobsAlert } from '@/components/monitoring/OrphanedJobsAlert';
import { PipelineHealthInline } from '@/components/pipeline/PipelineHealthInline';
import { AutomationRulesPanel } from '@/components/monitoring/AutomationRulesPanel';
import { AgentProcessesPanel } from '@/components/monitoring/AgentProcessesPanel';

interface AgentMetrics {
  id: string;
  name: string;
  os_type: 'windows' | 'linux' | 'macos' | 'unknown';
  os_version?: string;
  hostname?: string;
  status: string;
  last_heartbeat: string;
  is_online: boolean;
  cpu_usage: number | null;
  memory_usage: number | null;
  disk_usage: number | null;
  uptime_hours: number | null;
  metrics_age_minutes: number | null;
  agent_version?: string;
}

interface DashboardSummary {
  total_agents: number;
  online_agents: number;
  offline_agents: number;
  windows_agents: number;
  linux_agents: number;
  avg_cpu_usage: string | null;
  avg_memory_usage: string | null;
  avg_disk_usage: string | null;
  critical_alerts: number;
  high_alerts: number;
}

interface SystemAlert {
  id: string;
  alert_type: string;
  severity: string;
  title: string;
  message: string;
  created_at: string;
  acknowledged: boolean;
  agent_id: string | null;
  details?: {
    disk_usage?: number;
    memory_usage?: number;
    cpu_usage?: number;
    [key: string]: any;
  };
}

interface GroupedAlert extends SystemAlert {
  count: number;
  latestValue: number | null;
  groupKey: string;
}

export default function AgentMonitoringAdvanced() {
  const [agents, setAgents] = useState<AgentMetrics[]>([]);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [alerts, setAlerts] = useState<SystemAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'offline'>('all');
  const [selectedAgentForProcesses, setSelectedAgentForProcesses] = useState<{ id: string; name: string } | null>(null);
  const { tenant } = useTenant();

  const fetchDashboardData = async (showToast = false) => {
    try {
      if (showToast) setIsRefreshing(true);
      if (!tenant?.id) return;
      
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) return;

      const { data, error } = await supabase.functions.invoke('get-agent-dashboard-data', {
        body: { tenant_id: tenant.id },
        headers: {
          Authorization: `Bearer ${session.session.access_token}`,
        },
      });

      if (error) throw error;

      setSummary(data.summary);
      setAgents(data.agents);
      setAlerts(data.recent_alerts);
      
      if (showToast) {
        toast({
          title: 'Atualizado',
          description: 'Dados atualizados com sucesso',
        });
      }
    } catch (error) {
      logger.error('Error fetching dashboard data', error);
      toast({
        title: 'Erro',
        description: 'Falha ao carregar dados',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (tenant?.id) {
      fetchDashboardData();
    }
  }, [tenant?.id]);

  useEffect(() => {
    if (!tenant?.id) return;
    const refreshInterval = setInterval(fetchDashboardData, 30000);
    return () => {
      clearInterval(refreshInterval);
    };
  }, [tenant?.id]);

  const acknowledgeAlert = async (alertId: string) => {
    try {
      const { error } = await supabase
        .from('system_alerts')
        .update({ 
          acknowledged: true, 
          acknowledged_at: new Date().toISOString(),
          acknowledged_by: (await supabase.auth.getUser()).data.user?.id 
        })
        .eq('id', alertId);

      if (error) throw error;

      toast({
        title: 'Alerta Resolvido',
        description: 'O alerta foi marcado como resolvido',
      });
      
      fetchDashboardData();
    } catch (error) {
      logger.error('Error acknowledging alert', error);
      toast({
        title: 'Erro',
        description: 'Falha ao resolver alerta',
        variant: 'destructive',
      });
    }
  };

  // Agrupar alertas semanticamente por tipo + agente + faixa de métrica
  const groupedAlerts = useMemo((): GroupedAlert[] => {
    const groups: Record<string, GroupedAlert> = {};
    
    alerts.forEach(alert => {
      // Extrair valor da métrica do details
      const metricValue = alert.details?.disk_usage || 
                         alert.details?.memory_usage || 
                         alert.details?.cpu_usage || null;
      
      // Chave semântica: tipo + título (contém agente) + faixa de 5%
      const metricRange = metricValue ? Math.floor(metricValue / 5) * 5 : 'unknown';
      const key = `${alert.alert_type}-${alert.title}-${metricRange}`;
      
      if (!groups[key]) {
        groups[key] = { ...alert, count: 1, latestValue: metricValue, groupKey: key };
      } else {
        groups[key].count++;
        // Manter o mais recente
        if (new Date(alert.created_at) > new Date(groups[key].created_at)) {
          groups[key].created_at = alert.created_at;
          groups[key].latestValue = metricValue;
        }
      }
    });
    
    return Object.values(groups).sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [alerts]);

  // Resolver grupo de alertas
  const resolveAlertGroup = async (alertType: string, title: string, agentId?: string | null) => {
    try {
      // Obter usuário atual (CRÍTICO para alertas críticos)
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: 'Erro',
          description: 'Você precisa estar logado para resolver alertas',
          variant: 'destructive',
        });
        return;
      }

      logger.info('[resolveAlertGroup] Resolvendo alertas:', { alertType, title });

      // Resolver alertas com resolved_by (exigido pelo trigger para alertas críticos)
      // CORREÇÃO: Usar .eq() ao invés de .ilike() para match exato
      const { data: resolvedAlerts, error } = await supabase
        .from('system_alerts')
        .update({ 
          resolved: true, 
          resolved_at: new Date().toISOString(),
          resolved_by: user.id,
        })
        .eq('alert_type', alertType)
        .eq('title', title)
        .eq('resolved', false)
        .select('id, agent_id');

      if (error) throw error;

      const resolvedCount = resolvedAlerts?.length || 0;

      // MELHORIA: Feedback quando nenhum alerta foi encontrado
      if (resolvedCount === 0) {
        toast({
          title: 'Nenhum alerta encontrado',
          description: `Não foram encontrados alertas pendentes com este título`,
          variant: 'default',
        });
        return;
      }

      // Criar job de verificação se houver agent_id
      const targetAgentId = agentId || resolvedAlerts?.[0]?.agent_id;
      let jobCreated = false;
      
      if (targetAgentId && tenant?.id) {
        // Buscar nome do agente (obrigatório para a tabela jobs)
        const targetAgent = agents.find(a => a.id === targetAgentId);
        const agentName = targetAgent?.name || 'Agente Desconhecido';
        
        const jobPayload = { 
          source: 'alert_resolution',
          alert_type: alertType,
          resolved_by: user.id,
        };
        
        // Calcular payload_hash usando a função utilitária
        const jobWithHash = await prepareJobForInsert({
          tenant_id: tenant.id,
          agent_id: targetAgentId,
          agent_name: agentName,
          type: 'health_report',
          status: 'queued',
          payload: jobPayload,
        });
        
        const { error: jobError } = await supabase
          .from('jobs')
          .insert(jobWithHash);

        if (!jobError) {
          jobCreated = true;
        } else {
          logger.warn('Failed to create health_report job', jobError);
        }
      }

      toast({
        title: '✓ Alertas Resolvidos',
        description: `${resolvedCount} alerta(s) arquivado(s)${jobCreated ? ' e verificação iniciada' : ''}`,
      });
      
      fetchDashboardData();
    } catch (error: any) {
      logger.error('Error resolving alert group', error);
      toast({
        title: 'Erro ao resolver alertas',
        description: error?.message || 'Falha ao resolver alertas. Verifique se está logado.',
        variant: 'destructive',
      });
    }
  };

  // Problemas silenciosos (computadores offline há muito tempo)
  const silentProblems = useMemo(() => {
    const problems = [];
    
    const longOffline = agents.filter(a => {
      if (!a.last_heartbeat) return true;
      const lastHB = new Date(a.last_heartbeat);
      return (Date.now() - lastHB.getTime()) > 48 * 60 * 60 * 1000;
    });
    
    if (longOffline.length > 0) {
      problems.push({
        icon: '📴',
        text: `${longOffline.length} computador(es) offline há mais de 48h`,
        severity: 'high',
        agents: longOffline.map(a => a.name)
      });
    }
    
    return problems;
  }, [agents]);

  const filteredAgents = agents.filter((agent) => {
    const matchesSearch = agent.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      agent.hostname?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || 
      (statusFilter === 'online' && agent.is_online) ||
      (statusFilter === 'offline' && !agent.is_online);
    
    return matchesSearch && matchesStatus;
  });

  // Sort agents by risk level: Critical > Medium > Offline > Healthy
  const sortedAgents = useMemo(() => {
    return [...filteredAgents].sort((a, b) => {
      // Determine risk scores
      const getRiskScore = (agent: AgentMetrics) => {
        if (!agent.is_online) return 2; // Offline
        const hasCritical = (agent.cpu_usage ?? 0) > 90 || (agent.disk_usage ?? 0) > 90;
        const hasMedium = (agent.cpu_usage ?? 0) > 70 || (agent.memory_usage ?? 0) > 85 || (agent.disk_usage ?? 0) > 80;
        if (hasCritical) return 3; // Critical
        if (hasMedium) return 1; // Medium
        return 0; // Healthy
      };
      return getRiskScore(b) - getRiskScore(a);
    });
  }, [filteredAgents]);

  // Get agent card status styling
  const getAgentCardStyle = (agent: AgentMetrics) => {
    if (!agent.is_online) {
      return {
        border: 'border-dashed border-muted-foreground/50',
        bg: 'bg-muted/20',
        label: 'Offline'
      };
    }
    const hasCritical = (agent.cpu_usage ?? 0) > 90 || (agent.disk_usage ?? 0) > 90;
    const hasMedium = (agent.cpu_usage ?? 0) > 70 || (agent.memory_usage ?? 0) > 85 || (agent.disk_usage ?? 0) > 80;
    
    if (hasCritical) {
      return {
        border: 'border-red-500/50 border-l-4 border-l-red-500',
        bg: 'bg-red-500/5',
        label: 'Crítico'
      };
    }
    if (hasMedium) {
      return {
        border: 'border-amber-500/50 border-l-4 border-l-amber-500',
        bg: 'bg-amber-500/5',
        label: 'Atenção'
      };
    }
    return {
      border: 'border-border',
      bg: '',
      label: 'Normal'
    };
  };

  const getHealthColor = (value: number | null, threshold: number) => {
    if (value === null) return 'text-muted-foreground';
    if (value > threshold) return 'text-destructive';
    if (value > threshold * 0.8) return 'text-warning';
    return 'text-success';
  };

  const getHealthBg = (value: number | null, threshold: number) => {
    if (value === null) return 'bg-muted';
    if (value > threshold) return 'bg-destructive/10';
    if (value > threshold * 0.8) return 'bg-warning/10';
    return 'bg-success/10';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="text-muted-foreground">Carregando dados...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Monitor className="w-8 h-8 text-primary" />
            Monitoramento em Tempo Real
          </h1>
          <p className="text-muted-foreground mt-1">
            Acompanhe a saúde dos seus computadores
          </p>
        </div>
        <Button onClick={() => fetchDashboardData(true)} variant="outline" disabled={isRefreshing}>
          <RefreshCw className={cn("w-4 h-4 mr-2", isRefreshing && 'animate-spin')} />
          {isRefreshing ? 'Atualizando...' : 'Atualizar'}
        </Button>
      </div>

      {/* 🧭 P0 ANTI-SILÊNCIO - frescor das fontes de dados */}
      <PipelineHealthInline tenantId={tenant?.id} tenantLoading={!tenant?.id} />

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-l-4 border-l-primary">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Computadores</CardTitle>
            <Monitor className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{summary?.total_agents || 0}</div>
            <div className="flex gap-3 mt-2 text-sm">
              <span className="flex items-center gap-1 text-success">
                <Wifi className="h-3 w-3" /> {summary?.online_agents || 0} online
              </span>
              <span className="flex items-center gap-1 text-muted-foreground">
                <WifiOff className="h-3 w-3" /> {summary?.offline_agents || 0} offline
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className={cn("border-l-4", getHealthBg(parseFloat(summary?.avg_cpu_usage || '0'), 90))}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Processador (Média)</CardTitle>
            <Cpu className={cn("h-4 w-4", getHealthColor(parseFloat(summary?.avg_cpu_usage || '0'), 90))} />
          </CardHeader>
          <CardContent>
            <div className={cn("text-3xl font-bold", getHealthColor(parseFloat(summary?.avg_cpu_usage || '0'), 90))}>
              {summary?.avg_cpu_usage ? `${summary.avg_cpu_usage}%` : 'N/A'}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {parseFloat(summary?.avg_cpu_usage || '0') > 90 ? '⚠️ Uso elevado' : '✓ Normal'}
            </p>
          </CardContent>
        </Card>

        <Card className={cn("border-l-4", getHealthBg(parseFloat(summary?.avg_memory_usage || '0'), 85))}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Memória RAM (Média)</CardTitle>
            <MemoryStick className={cn("h-4 w-4", getHealthColor(parseFloat(summary?.avg_memory_usage || '0'), 85))} />
          </CardHeader>
          <CardContent>
            <div className={cn("text-3xl font-bold", getHealthColor(parseFloat(summary?.avg_memory_usage || '0'), 85))}>
              {summary?.avg_memory_usage ? `${summary.avg_memory_usage}%` : 'N/A'}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {parseFloat(summary?.avg_memory_usage || '0') > 85 ? '⚠️ Uso elevado' : '✓ Normal'}
            </p>
          </CardContent>
        </Card>

        <Card className={cn("border-l-4", getHealthBg(parseFloat(summary?.avg_disk_usage || '0'), 90))}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Armazenamento (Média)</CardTitle>
            <HardDrive className={cn("h-4 w-4", getHealthColor(parseFloat(summary?.avg_disk_usage || '0'), 90))} />
          </CardHeader>
          <CardContent>
            <div className={cn("text-3xl font-bold", getHealthColor(parseFloat(summary?.avg_disk_usage || '0'), 90))}>
              {summary?.avg_disk_usage ? `${summary.avg_disk_usage}%` : 'N/A'}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {parseFloat(summary?.avg_disk_usage || '0') > 90 ? '⚠️ Disco cheio' : '✓ Normal'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Status de Versões dos Agentes */}
      <AgentVersionStatus 
        agents={agents.map(a => ({ 
          id: a.id, 
          name: a.name, 
          agent_version: a.agent_version,
          is_online: a.is_online 
        }))} 
        tenantId={tenant?.id || null}
        onRefresh={() => fetchDashboardData()}
      />

      {/* Jobs Órfãos */}
      <OrphanedJobsAlert 
        tenantId={tenant?.id || null}
        onRefresh={() => fetchDashboardData()}
      />

      {/* Problemas Silenciosos */}
      {silentProblems.length > 0 && (
        <Card className="border-warning/50 bg-warning/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-warning">
              <AlertTriangle className="w-5 h-5" />
              Problemas Silenciosos
            </CardTitle>
            <CardDescription>
              Situações que precisam de atenção mas não geram alarmes
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {silentProblems.map((problem, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-card border rounded-lg">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{problem.icon}</span>
                    <div>
                      <span className="font-medium">{problem.text}</span>
                      {problem.agents.length <= 3 && (
                        <p className="text-xs text-muted-foreground">
                          {problem.agents.join(', ')}
                        </p>
                      )}
                    </div>
                  </div>
                  <Badge variant={problem.severity === 'high' ? 'destructive' : 'secondary'}>
                    {problem.severity === 'high' ? 'Urgente' : 'Atenção'}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Alerts Section - Collapsible with severity grouping */}
      {groupedAlerts.length > 0 && (
        <Collapsible defaultOpen={true}>
          <Card className="border-l-4 border-l-red-500 bg-red-500/5">
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                className="w-full p-4 h-auto justify-between hover:bg-transparent"
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">🔴</span>
                  <AlertCircle className="w-5 h-5 text-red-500" />
                  <span className="text-lg font-semibold">Alertas Pendentes</span>
                  <Badge className="bg-red-500 text-white">
                    {alerts.length}
                  </Badge>
                  <span className="text-xs text-muted-foreground ml-2">
                    ({groupedAlerts.length} grupos)
                  </span>
                </div>
                <ChevronDown className="h-5 w-5 text-muted-foreground transition-transform data-[state=open]:rotate-180" />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0">
                <p className="text-sm text-muted-foreground mb-4">
                  Alertas similares foram agrupados para facilitar a gestão
                </p>
                <div className="space-y-3">
                  {groupedAlerts.slice(0, 5).map((alert) => (
                    <div key={alert.groupKey || `${alert.alert_type}-${alert.title}`} className="flex items-center justify-between p-4 bg-card border rounded-lg">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <Badge variant={alert.severity === 'critical' ? 'destructive' : 'secondary'}>
                            {alert.severity === 'critical' ? '🔴 Crítico' : alert.severity === 'high' ? '🟠 Alto' : '🟡 Médio'}
                          </Badge>
                          <span className="font-semibold">{alert.title}</span>
                          {alert.count > 1 && (
                            <Badge variant="outline" className="ml-2">
                              {alert.count} ocorrências
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {alert.message}
                          {alert.latestValue && (
                            <span className="font-mono ml-2 text-destructive">({alert.latestValue.toFixed(1)}%)</span>
                          )}
                        </p>
                        {/* Impact info */}
                        <p className="text-xs text-orange-600 dark:text-orange-400 mt-1 font-medium">
                          Impacto: {alert.severity === 'critical' ? 'Pode causar indisponibilidade' : 'Requer atenção preventiva'}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Último: {formatBrazilDateTime(alert.created_at, 'datetime')}
                        </p>
                      </div>
                      <Button 
                        onClick={() => resolveAlertGroup(alert.alert_type, alert.title)} 
                        variant="outline" 
                        size="sm"
                      >
                        <CheckCircle className="w-4 h-4 mr-1" />
                        {alert.count > 1 ? 'Aplicar correções' : 'Aplicar correção'}
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}

      {/* Search and Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[250px]">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome do computador..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant={statusFilter === 'all' ? 'default' : 'outline'}
                onClick={() => setStatusFilter('all')}
                size="sm"
              >
                Todos ({summary?.total_agents || 0})
              </Button>
              <Button
                variant={statusFilter === 'online' ? 'default' : 'outline'}
                onClick={() => setStatusFilter('online')}
                size="sm"
                className={statusFilter === 'online' ? '' : 'text-success hover:text-success'}
              >
                <Wifi className="w-4 h-4 mr-1" />
                Online ({summary?.online_agents || 0})
              </Button>
              <Button
                variant={statusFilter === 'offline' ? 'default' : 'outline'}
                onClick={() => setStatusFilter('offline')}
                size="sm"
              >
                <WifiOff className="w-4 h-4 mr-1" />
                Offline ({summary?.offline_agents || 0})
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Agents Grid - Sorted by risk */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {sortedAgents.map((agent) => {
          const cardStyle = getAgentCardStyle(agent);
          
          return (
            <Card key={agent.id} className={cn(
              "transition-all duration-200 hover:shadow-lg",
              cardStyle.border,
              cardStyle.bg
            )}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{getOsIcon(agent.os_type)}</span>
                    <div>
                      <CardTitle className="text-base">{agent.name}</CardTitle>
                      <p className="text-xs text-muted-foreground">{agent.hostname || 'N/A'}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge variant={agent.is_online ? 'default' : 'secondary'} className={cn(
                      agent.is_online ? "bg-success text-success-foreground" : ""
                    )}>
                      {agent.is_online ? (
                        <><CheckCircle className="w-3 h-3 mr-1" /> Online</>
                      ) : (
                        <><XCircle className="w-3 h-3 mr-1" /> Offline</>
                      )}
                    </Badge>
                    {cardStyle.label !== 'Normal' && cardStyle.label !== 'Offline' && (
                      <Badge 
                        variant="outline" 
                        className={cn(
                          'text-xs',
                          cardStyle.label === 'Crítico' ? 'bg-red-500/10 text-red-500 border-red-500/20' : 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                        )}
                      >
                        {cardStyle.label}
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Resource Bars with Intelligent Tooltips */}
                <div className="space-y-3">
                  {/* CPU */}
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="cursor-help">
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-muted-foreground">Processador</span>
                            <span className={getHealthColor(agent.cpu_usage, 90)}>
                              {agent.cpu_usage !== null ? `${agent.cpu_usage.toFixed(0)}%` : 'N/A'}
                            </span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div 
                              className={cn("h-full transition-all", 
                                agent.cpu_usage !== null && agent.cpu_usage > 90 ? 'bg-destructive' : 
                                agent.cpu_usage !== null && agent.cpu_usage > 70 ? 'bg-warning' : 'bg-success'
                              )}
                              style={{ width: `${agent.cpu_usage || 0}%` }}
                            />
                          </div>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        {agent.cpu_usage !== null && agent.cpu_usage > 90 ? (
                          <>
                            <p className="font-medium text-red-500">CPU em uso excessivo</p>
                            <p className="text-xs">Risco: travamento ou lentidão severa</p>
                            <p className="text-xs text-muted-foreground">Ação: investigar processos consumindo CPU</p>
                          </>
                        ) : agent.cpu_usage !== null && agent.cpu_usage > 70 ? (
                          <>
                            <p className="font-medium text-amber-500">CPU elevada</p>
                            <p className="text-xs">Monitorar possível degradação</p>
                          </>
                        ) : (
                          <p className="text-xs">Uso de CPU normal</p>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  {/* Memory */}
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="cursor-help">
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-muted-foreground">Memória RAM</span>
                            <span className={getHealthColor(agent.memory_usage, 85)}>
                              {agent.memory_usage !== null ? `${agent.memory_usage.toFixed(0)}%` : 'N/A'}
                            </span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div 
                              className={cn("h-full transition-all", 
                                agent.memory_usage !== null && agent.memory_usage > 85 ? 'bg-destructive' : 
                                agent.memory_usage !== null && agent.memory_usage > 70 ? 'bg-warning' : 'bg-success'
                              )}
                              style={{ width: `${agent.memory_usage || 0}%` }}
                            />
                          </div>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        {agent.memory_usage !== null && agent.memory_usage > 85 ? (
                          <>
                            <p className="font-medium text-red-500">Memória crítica</p>
                            <p className="text-xs">Risco: sistema pode travar</p>
                            <p className="text-xs text-muted-foreground">Ação: encerrar aplicativos não essenciais</p>
                          </>
                        ) : agent.memory_usage !== null && agent.memory_usage > 70 ? (
                          <>
                            <p className="font-medium text-amber-500">Memória elevada</p>
                            <p className="text-xs">Recomendado monitorar</p>
                          </>
                        ) : (
                          <p className="text-xs">Uso de memória normal</p>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  {/* Disk */}
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="cursor-help">
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-muted-foreground">Armazenamento</span>
                            <span className={getHealthColor(agent.disk_usage, 90)}>
                              {agent.disk_usage !== null ? `${agent.disk_usage.toFixed(0)}%` : 'N/A'}
                            </span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div 
                              className={cn("h-full transition-all", 
                                agent.disk_usage !== null && agent.disk_usage > 90 ? 'bg-destructive' : 
                                agent.disk_usage !== null && agent.disk_usage > 80 ? 'bg-warning' : 'bg-success'
                              )}
                              style={{ width: `${agent.disk_usage || 0}%` }}
                            />
                          </div>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        {agent.disk_usage !== null && agent.disk_usage > 90 ? (
                          <>
                            <p className="font-medium text-red-500">Disco quase cheio</p>
                            <p className="text-xs">Risco: falha de escrita / travamento</p>
                            <p className="text-xs text-muted-foreground">Ação: limpeza ou expansão urgente</p>
                          </>
                        ) : agent.disk_usage !== null && agent.disk_usage > 80 ? (
                          <>
                            <p className="font-medium text-amber-500">Espaço em disco baixo</p>
                            <p className="text-xs">Recomendado liberar espaço</p>
                          </>
                        ) : (
                          <p className="text-xs">Espaço em disco adequado</p>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>

                {/* Footer Info */}
                <div className="flex justify-between items-center pt-2 border-t text-xs text-muted-foreground">
                  <span>{getOsDisplayName(agent.os_type, agent.os_version || null)}</span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 px-1.5 text-[10px]"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedAgentForProcesses(
                          selectedAgentForProcesses?.id === agent.id
                            ? null
                            : { id: agent.id, name: agent.name }
                        );
                      }}
                    >
                      <Cog className="h-3 w-3 mr-0.5" />
                      Processos
                    </Button>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {agent.uptime_hours !== null ? `${agent.uptime_hours}h ligado` : 'N/A'}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {sortedAgents.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Monitor className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-2">Nenhum computador encontrado</h3>
            <p className="text-muted-foreground">
              {searchTerm ? 'Tente uma busca diferente' : 'Instale o agente nos computadores para começar o monitoramento'}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Process Details for selected agent */}
      {selectedAgentForProcesses && (
        <AgentProcessesPanel
          agentId={selectedAgentForProcesses.id}
          agentName={selectedAgentForProcesses.name}
        />
      )}

      {/* Automation Rules */}
      <AutomationRulesPanel />
    </div>
  );
}