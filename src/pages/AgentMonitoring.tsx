import { useEffect, useState, useMemo } from "react";
import { getAgentOnlineStatus } from '@/lib/agent-status-constants';
import { Activity, AlertTriangle, CheckCircle2, Clock, TrendingUp, Wifi, WifiOff, Zap, LineChart as LineChartIcon, BarChart3, Monitor, RefreshCw } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { subDays } from "date-fns";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useTenant } from "@/hooks/useTenant";
import { logger } from "@/lib/logger";
import { getJobTypeLabel, getJobStatusLabel } from "@/lib/job-labels";
import { formatBrazilDateTime } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { PipelineHealthInline } from "@/components/pipeline/PipelineHealthInline";
interface Agent {
  id: string;
  agent_name: string;
  status: string;
  last_heartbeat: string | null;
  enrolled_at: string;
}

interface Job {
  id: string;
  type: string;
  status: string;
  agent_name: string;
  created_at: string;
  completed_at: string | null;
}

const AgentMonitoring = () => {
  // V-FIX: Extract loading guard to prevent race conditions during tenant sync
  const { tenant, loading: tenantLoading } = useTenant();
  const queryClient = useQueryClient();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [recentJobs, setRecentJobs] = useState<Job[]>([]);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  // Helper function - usa getAgentOnlineStatus centralizado
  const getAgentCalculatedStatus = (agent: Agent & { agent_state?: string }): 'online' | 'warning' | 'offline' | 'never_connected' => {
    return getAgentOnlineStatus(agent as never);
  };

  // Manual refresh function
  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['agents-monitoring'] });
    queryClient.invalidateQueries({ queryKey: ['jobs-monitoring'] });
    queryClient.invalidateQueries({ queryKey: ['historical-scans'] });
    queryClient.invalidateQueries({ queryKey: ['historical-jobs'] });
    queryClient.invalidateQueries({ queryKey: ['agent-uptime'] });
    setLastUpdate(new Date());
    toast.success("Dados atualizados!");
  };
  // Fetch initial data - filtered by tenant
  const { data: initialAgents } = useQuery({
    queryKey: ['agents-monitoring', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      // ADR-026: Usar RPC com tenant_id explícito para evitar dessincronização JWT
      const { data, error } = await supabase.rpc('get_agents_list', {
        p_tenant_id: tenant.id,
        p_include_archived: false
      });
      
      if (error) throw error;
      // RPC retorna jsonb objects com nomes de campos corretos, ordenar por enrolled_at
      return ((data || []) as any[])
        .map((agent: any) => ({
          id: agent.id,
          agent_name: agent.agent_name,
          status: agent.status,
          last_heartbeat: agent.last_heartbeat,
          enrolled_at: agent.enrolled_at,
          agent_state: agent.agent_state,
        }))
        .sort((a, b) => new Date(b.enrolled_at).getTime() - new Date(a.enrolled_at).getTime()) as Agent[];
    },
    // V-FIX: Guard with !tenantLoading to prevent queries before JWT sync completes
    enabled: !tenantLoading && !!tenant?.id
  });

  const { data: initialJobs } = useQuery({
    queryKey: ['jobs-monitoring', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('jobs')
        .select('id, agent_id, agent_name, type, status, created_at, delivered_at, completed_at, approved, tenant_id')
        .eq('tenant_id', tenant.id)
        .gte('created_at', twentyFourHoursAgo)
        .order('created_at', { ascending: false })
        .limit(100);
      
      if (error) throw error;
      return data as Job[];
    },
    // V-FIX: Guard with !tenantLoading to prevent queries before JWT sync completes
    enabled: !tenantLoading && !!tenant?.id
  });

  // Historical data for charts - last 7 days
  const { data: historicalScans } = useQuery({
    queryKey: ['historical-scans', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      
      const sevenDaysAgo = subDays(new Date(), 7).toISOString();
      const { data, error } = await supabase
        .from('virus_scans')
        .select('scanned_at, is_malicious')
        .eq('tenant_id', tenant.id)
        .gte('scanned_at', sevenDaysAgo)
        .order('scanned_at');
      
      if (error) throw error;
      return data;
    },
    // V-FIX: Guard with !tenantLoading to prevent queries before JWT sync completes
    enabled: !tenantLoading && !!tenant?.id
  });

  const { data: historicalJobs } = useQuery({
    queryKey: ['historical-jobs', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      
      const sevenDaysAgo = subDays(new Date(), 7).toISOString();
      const { data, error } = await supabase
        .from('jobs')
        .select('created_at, status, completed_at')
        .eq('tenant_id', tenant.id)
        .gte('created_at', sevenDaysAgo)
        .order('created_at');
      
      if (error) throw error;
      return data;
    },
    // V-FIX: Guard with !tenantLoading to prevent queries before JWT sync completes
    enabled: !tenantLoading && !!tenant?.id
  });

  const { data: agentUptimeData } = useQuery({
    queryKey: ['agent-uptime', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      
      // ADR-026: Usar RPC com tenant_id explícito para evitar dessincronização JWT
      const { data, error } = await supabase.rpc('get_agents_list', {
        p_tenant_id: tenant.id,
        p_include_archived: false
      });
      
      if (error) throw error;
      // RPC retorna jsonb objects com nomes de campos corretos
      return (data || []).map((agent: any) => ({
        agent_name: agent.agent_name,
        last_heartbeat: agent.last_heartbeat,
        enrolled_at: agent.enrolled_at,
      }));
    },
    // V-FIX: Guard with !tenantLoading to prevent queries before JWT sync completes
    enabled: !tenantLoading && !!tenant?.id
  });

  // Setup realtime subscriptions - with tenant filter
  useEffect(() => {
    if (initialAgents) setAgents(initialAgents);
    if (initialJobs) setRecentJobs(initialJobs);
  }, [initialAgents, initialJobs]);

  // Separate effect for realtime with tenant dependency
  useEffect(() => {
    if (!tenant?.id) return;

    // Subscribe to agents changes - filtered by tenant
    const agentsChannel = supabase
      .channel(`agents-realtime-${tenant.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'agents',
          filter: `tenant_id=eq.${tenant.id}`
        },
        (payload) => {
          logger.debug('Agent change', { payload });
          
          if (payload.eventType === 'INSERT') {
            setAgents(prev => [payload.new as Agent, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setAgents(prev => prev.map(a => a.id === payload.new.id ? payload.new as Agent : a));
          } else if (payload.eventType === 'DELETE') {
            setAgents(prev => prev.filter(a => a.id !== payload.old.id));
          }
          setLastUpdate(new Date());
        }
      )
      .subscribe();

    // Subscribe to jobs changes - filtered by tenant
    const jobsChannel = supabase
      .channel(`jobs-realtime-${tenant.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'jobs',
          filter: `tenant_id=eq.${tenant.id}`
        },
        (payload) => {
          logger.debug('Job change', { payload });
          
          if (payload.eventType === 'INSERT') {
            setRecentJobs(prev => [payload.new as Job, ...prev].slice(0, 10));
          } else if (payload.eventType === 'UPDATE') {
            setRecentJobs(prev => prev.map(j => j.id === payload.new.id ? payload.new as Job : j));
          }
          setLastUpdate(new Date());
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(agentsChannel);
      supabase.removeChannel(jobsChannel);
    };
  }, [tenant?.id]);

  // Calculate metrics - using last_heartbeat for accurate online/offline status
  const totalAgents = agents.length;
  const onlineAgents = agents.filter(a => {
    const status = getAgentCalculatedStatus(a);
    return status === 'online' || status === 'warning';
  }).length;
  const offlineAgents = agents.filter(a => {
    const status = getAgentCalculatedStatus(a);
    return status === 'offline' || status === 'never_connected';
  }).length;
  const failedJobs = recentJobs.filter(j => j.status === 'failed').length;
  // Fix: Calculate success rate only from finished jobs (completed + failed)
  const finishedJobs = recentJobs.filter(j => j.status === 'completed' || j.status === 'failed');
  const successRate = finishedJobs.length > 0 
    ? Math.round((finishedJobs.filter(j => j.status === 'completed').length / finishedJobs.length) * 100)
    : 100;

  // Determine global health status
  const globalStatus = useMemo(() => {
    if (offlineAgents === 0 && successRate >= 90) return 'healthy';
    if (offlineAgents > 2 || successRate < 50) return 'critical';
    return 'warning';
  }, [offlineAgents, successRate]);

  // Sort agents by severity (offline first)
  const sortedAgents = useMemo(() => {
    return [...agents].sort((a, b) => {
      const getMinutesSinceHeartbeat = (agent: Agent) => {
        if (!agent.last_heartbeat) return 999999;
        return (Date.now() - new Date(agent.last_heartbeat).getTime()) / 1000 / 60;
      };
      
      const aMinutes = getMinutesSinceHeartbeat(a);
      const bMinutes = getMinutesSinceHeartbeat(b);
      
      // Offline first (>5 min), then warning (2-5 min), then online (<2 min)
      if (aMinutes >= 5 && bMinutes < 5) return -1;
      if (bMinutes >= 5 && aMinutes < 5) return 1;
      return bMinutes - aMinutes;
    });
  }, [agents]);

  const getStatusBadge = (status: string, lastHeartbeat: string | null) => {
    if (!lastHeartbeat) {
      return (
        <Badge variant="secondary" className="gap-1">
          <WifiOff className="h-3 w-3" />
          Sem Sinal
        </Badge>
      );
    }

    const minutesSinceHeartbeat = (Date.now() - new Date(lastHeartbeat).getTime()) / 1000 / 60;

    if (minutesSinceHeartbeat < 2) {
      return (
        <Badge className="bg-green-500 gap-1">
          <Wifi className="h-3 w-3" />
          Online
        </Badge>
      );
    } else if (minutesSinceHeartbeat < 5) {
      return (
        <Badge className="bg-yellow-500 gap-1">
          <AlertTriangle className="h-3 w-3" />
          Atenção
        </Badge>
      );
    } else {
      return (
        <Badge className="bg-red-500 gap-1">
          <WifiOff className="h-3 w-3" />
          Offline
        </Badge>
      );
    }
  };

  const getJobStatusBadge = (status: string) => {
    switch (status) {
      case 'done':
      case 'completed':
        return <Badge className="bg-green-500">✓ Concluído</Badge>;
      case 'queued':
        return <Badge className="bg-blue-500">⏳ Na Fila</Badge>;
      case 'delivered':
        return <Badge className="bg-yellow-500">⚙️ Executando</Badge>;
      case 'failed':
        return <Badge variant="destructive">❌ Falhou</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getTimeSince = (date: string | null) => {
    if (!date) return 'Nunca';
    const now = new Date();
    const past = new Date(date);
    const diffMs = now.getTime() - past.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    
    if (diffMins < 1) return 'Agora mesmo';
    if (diffMins < 60) return `${diffMins}min atrás`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h atrás`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d atrás`;
  };

  // Prepare chart data
  const getLast7Days = () => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const date = subDays(new Date(), i);
      const dateStr = date.toISOString().split('T')[0];
      const label = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
      days.push({
        date: dateStr,
        label: label
      });
    }
    return days;
  };

  const last7Days = getLast7Days();

  // Scans trend data
  const scansTrendData = last7Days.map(day => {
    const dayScans = historicalScans?.filter(s => s.scanned_at.startsWith(day.date)) || [];
    return {
      date: day.label,
      total: dayScans.length,
      malicious: dayScans.filter(s => s.is_malicious).length,
      clean: dayScans.filter(s => !s.is_malicious).length,
    };
  });

  // Jobs trend data
  const jobsTrendData = last7Days.map(day => {
    const dayJobs = historicalJobs?.filter(j => j.created_at.startsWith(day.date)) || [];
    return {
      date: day.label,
      total: dayJobs.length,
      completed: dayJobs.filter(j => j.status === 'completed').length,
      failed: dayJobs.filter(j => j.status === 'failed').length,
      pending: dayJobs.filter(j => j.status === 'queued' || j.status === 'delivered').length,
    };
  });

  // Agent uptime data
  const uptimeChartData = agentUptimeData?.map(agent => {
    const lastHeartbeat = agent.last_heartbeat ? new Date(agent.last_heartbeat) : null;
    const now = new Date();
    const diffMins = lastHeartbeat ? (now.getTime() - lastHeartbeat.getTime()) / (1000 * 60) : 999;
    const uptime = diffMins < 5 ? 100 : 0;
    
    return {
      name: agent.agent_name.length > 15 ? agent.agent_name.substring(0, 12) + '...' : agent.agent_name,
      uptime,
    };
  }) || [];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-cyber rounded-xl border border-primary/20">
            <Activity className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Monitoramento em Tempo Real
            </h1>
            <p className="text-sm text-muted-foreground">Acompanhe status e performance dos computadores</p>
          </div>
        </div>
        
        {/* Last Update Indicator + Refresh Button */}
        <div className="flex items-center gap-3 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>Atualizado: {formatBrazilDateTime(lastUpdate, 'time')}</span>
          </div>
          <Button variant="outline" size="sm" onClick={handleRefresh} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </Button>
        </div>
      </div>

      {/* 🧭 P0 ANTI-SILÊNCIO - frescor das fontes de dados */}
      <PipelineHealthInline tenantId={tenant?.id} tenantLoading={tenantLoading} />

      {/* 🟢 CAMADA 1: ESTADO GLOBAL */}
      <Card className={cn(
        "border-2",
        globalStatus === 'healthy' ? "bg-green-500/10 border-green-500/30" :
        globalStatus === 'critical' ? "bg-red-500/10 border-red-500/30" :
        "bg-yellow-500/10 border-yellow-500/30"
      )}>
        <CardContent className="py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="text-5xl">
                {globalStatus === 'healthy' ? '🟢' : 
                 globalStatus === 'critical' ? '🔴' : '🟡'}
              </div>
              <div>
                <h2 className="text-2xl font-bold">
                  {globalStatus === 'healthy' ? 'Sistema Funcionando Normalmente' : 
                   globalStatus === 'critical' ? 'Atenção Necessária' : 
                   'Pequenos Ajustes Recomendados'}
                </h2>
                <div className="space-y-1 text-sm text-muted-foreground mt-2">
                  {globalStatus === 'healthy' ? (
                    <>
                      <p>✓ Todos os computadores estão conectados</p>
                      <p>✓ Taxa de sucesso das tarefas: {successRate}%</p>
                    </>
                  ) : (
                    <>
                      {offlineAgents > 0 && <p>• {offlineAgents} computador(es) offline precisam de verificação</p>}
                      {failedJobs > 0 && <p>• {failedJobs} tarefa(s) falharam recentemente</p>}
                      {successRate < 90 && <p>• Taxa de sucesso abaixo do esperado: {successRate}%</p>}
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="text-right">
              <p className="text-4xl font-bold">{totalAgents}</p>
              <p className="text-sm text-muted-foreground">computador(es) monitorado(s)</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 🟡 CAMADA 2: INDICADORES COM CONTEXTO EMOCIONAL */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-gradient-card border-primary/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Base Monitorada</CardTitle>
            <Monitor className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalAgents}</div>
            <p className="text-xs text-muted-foreground">
              {onlineAgents} online, {offlineAgents} offline
            </p>
          </CardContent>
        </Card>

        <Card className={cn(
          "bg-gradient-card",
          onlineAgents === totalAgents && totalAgents > 0 ? "border-green-500/30" : "border-primary/20"
        )}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Computadores Online</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">{onlineAgents}</div>
            <p className={cn(
              "text-xs",
              onlineAgents === totalAgents && totalAgents > 0 ? "text-green-500" : "text-muted-foreground"
            )}>
              {onlineAgents === totalAgents && totalAgents > 0 ? '✓ Todos conectados' : `${totalAgents > 0 ? Math.round((onlineAgents / totalAgents) * 100) : 0}% do total`}
            </p>
          </CardContent>
        </Card>

        <Card className={cn(
          "bg-gradient-card",
          offlineAgents > 0 ? "border-red-500/30" : "border-green-500/30"
        )}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Computadores Offline</CardTitle>
            <AlertTriangle className={cn("h-4 w-4", offlineAgents > 0 ? "text-red-500" : "text-green-500")} />
          </CardHeader>
          <CardContent>
            <div className={cn("text-2xl font-bold", offlineAgents > 0 ? "text-red-500" : "text-green-500")}>
              {offlineAgents}
            </div>
            <p className={cn("text-xs", offlineAgents > 0 ? "text-red-400" : "text-green-500")}>
              {offlineAgents > 0 ? '⚠️ Requerem verificação' : '✓ Nenhum offline'}
            </p>
          </CardContent>
        </Card>

        <Card className={cn(
          "bg-gradient-card",
          successRate >= 90 ? "border-green-500/30" :
          successRate >= 50 ? "border-yellow-500/30" : "border-red-500/30"
        )}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Taxa de Sucesso</CardTitle>
            <TrendingUp className={cn(
              "h-4 w-4",
              successRate >= 90 ? "text-green-500" :
              successRate >= 50 ? "text-yellow-500" : "text-red-500"
            )} />
          </CardHeader>
          <CardContent>
            <div className={cn(
              "text-2xl font-bold",
              successRate >= 90 ? "text-green-500" :
              successRate >= 50 ? "text-yellow-500" : "text-red-500"
            )}>
              {successRate}%
            </div>
            <p className={cn(
              "text-xs",
              successRate >= 90 ? "text-green-500" :
              successRate >= 50 ? "text-yellow-500" : "text-red-400"
            )}>
              {successRate >= 90 ? '✓ Excelente performance' :
               successRate >= 50 ? '⚠️ Performance moderada' : '❌ Muitas falhas detectadas'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 🔵 CAMADA 3: GRÁFICOS COM NARRATIVA */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Scans Trend */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LineChartIcon className="h-5 w-5 text-primary" />
              Verificações de Segurança (7 dias)
            </CardTitle>
            <CardDescription>
              Volume de scans de vírus realizados
              <span className="block text-xs mt-1 text-muted-foreground/70">
                📊 Linha subindo = mais verificações • Estável = operação normal
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            {scansTrendData.every(d => d.total === 0) ? (
              <div className="text-center py-8">
                <LineChartIcon className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
                <p className="text-muted-foreground">Nenhuma verificação nos últimos 7 dias</p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  As verificações automáticas acontecem periodicamente
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={scansTrendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" style={{ fontSize: '12px' }} />
                  <YAxis stroke="hsl(var(--muted-foreground))" style={{ fontSize: '12px' }} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))', 
                      borderRadius: '6px' 
                    }} 
                  />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Line type="monotone" dataKey="total" stroke="hsl(var(--primary))" name="Total" strokeWidth={2} />
                  <Line type="monotone" dataKey="malicious" stroke="hsl(var(--destructive))" name="Maliciosos" strokeWidth={2} />
                  <Line type="monotone" dataKey="clean" stroke="hsl(var(--success))" name="Limpos" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Jobs Trend */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              Execução de Tarefas (7 dias)
            </CardTitle>
            <CardDescription>
              Performance das tarefas ao longo do tempo
              <span className="block text-xs mt-1 text-muted-foreground/70">
                📊 Verde = sucesso • Amarelo = pendente • Vermelho = falha
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            {jobsTrendData.every(d => d.total === 0) ? (
              <div className="text-center py-8">
                <BarChart3 className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
                <p className="text-muted-foreground">Nenhuma tarefa executada nos últimos 7 dias</p>
                <p className="text-xs text-green-500 mt-1">
                  ✓ Isso pode indicar estabilidade operacional
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={jobsTrendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" style={{ fontSize: '12px' }} />
                  <YAxis stroke="hsl(var(--muted-foreground))" style={{ fontSize: '12px' }} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))', 
                      borderRadius: '6px' 
                    }} 
                  />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Bar dataKey="completed" fill="hsl(var(--success))" name="Concluídos" />
                  <Bar dataKey="pending" fill="hsl(var(--warning))" name="Pendentes" />
                  <Bar dataKey="failed" fill="hsl(var(--destructive))" name="Falhados" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Agent Uptime */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wifi className="h-5 w-5 text-primary" />
            Tempo Online dos Computadores
          </CardTitle>
          <CardDescription>
            Status de conectividade atual de cada computador
            <span className="block text-xs mt-1 text-muted-foreground/70">
              📊 Barra cheia (100%) = online agora • Barra vazia = offline
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {uptimeChartData.length === 0 ? (
            <div className="text-center py-8">
              <Monitor className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
              <p className="text-muted-foreground">Nenhum computador cadastrado</p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                Cadastre computadores para ver o status aqui
              </p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(200, uptimeChartData.length * 40)}>
              <BarChart data={uptimeChartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" domain={[0, 100]} stroke="hsl(var(--muted-foreground))" style={{ fontSize: '12px' }} />
                <YAxis type="category" dataKey="name" stroke="hsl(var(--muted-foreground))" style={{ fontSize: '12px' }} width={100} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))', 
                    border: '1px solid hsl(var(--border))', 
                    borderRadius: '6px' 
                  }}
                  formatter={(value: any) => [`${value}%`, 'Uptime']}
                />
                <Bar dataKey="uptime" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Agents Status - ORDENADO POR GRAVIDADE */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Status dos Computadores
          </CardTitle>
          <CardDescription>
            Atualização em tempo real — computadores com problemas aparecem primeiro
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {sortedAgents.length === 0 ? (
              <div className="text-center py-8">
                <Monitor className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
                <p className="text-muted-foreground">Nenhum computador cadastrado</p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  Use uma chave de registro para adicionar computadores
                </p>
              </div>
            ) : (
              sortedAgents.map((agent) => {
                const minutesSinceHeartbeat = agent.last_heartbeat 
                  ? (Date.now() - new Date(agent.last_heartbeat).getTime()) / 1000 / 60 
                  : 999;
                const isOffline = minutesSinceHeartbeat >= 5;
                const isWarning = minutesSinceHeartbeat >= 2 && minutesSinceHeartbeat < 5;
                
                return (
                  <div
                    key={agent.id}
                    className={cn(
                      "flex items-center justify-between p-4 rounded-lg border transition-colors",
                      isOffline ? "bg-red-500/5 border-red-500/30" :
                      isWarning ? "bg-yellow-500/5 border-yellow-500/30" :
                      "bg-card hover:bg-accent/5"
                    )}
                  >
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "w-3 h-3 rounded-full animate-pulse",
                        isOffline ? 'bg-red-500' :
                        isWarning ? 'bg-yellow-500' : 'bg-green-500'
                      )} />
                      <div>
                        <p className="font-medium">{agent.agent_name}</p>
                        <p className="text-sm text-muted-foreground flex items-center gap-2">
                          <Clock className="w-3 h-3" />
                          Último sinal: {getTimeSince(agent.last_heartbeat)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Registrado: {formatBrazilDateTime(agent.enrolled_at, 'datetime')}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {getStatusBadge(agent.status, agent.last_heartbeat)}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>

      {/* Recent Jobs - COM NOMES AMIGÁVEIS */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Tarefas Recentes
          </CardTitle>
          <CardDescription>Últimas 10 tarefas executadas pelo sistema</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {recentJobs.length === 0 ? (
              <div className="text-center py-8">
                <Activity className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
                <p className="text-muted-foreground">Nenhuma tarefa executada ainda</p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  As tarefas aparecerão aqui conforme forem executadas
                </p>
              </div>
            ) : (
              recentJobs.map((job) => (
                <div
                  key={job.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/5 transition-colors"
                >
                  <div>
                    {/* ⭐ USANDO getJobTypeLabel PARA NOMES AMIGÁVEIS */}
                    <p className="font-medium text-sm">{getJobTypeLabel(job.type)}</p>
                    <p className="text-xs text-muted-foreground">
                      Computador: {job.agent_name} • {formatBrazilDateTime(job.created_at, 'short')}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {getJobStatusBadge(job.status)}
                    {job.completed_at && (
                      <span className="text-xs text-muted-foreground">
                        {Math.round((new Date(job.completed_at).getTime() - new Date(job.created_at).getTime()) / 1000)}s
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* 💡 FRASE ÂNCORA DE CONFIANÇA */}
      <Card className="bg-muted/20 border-dashed">
        <CardContent className="py-4 text-center">
          <p className="text-sm text-muted-foreground">
            💡 Esta página atualiza automaticamente em tempo real.
            <br />
            <span className="text-primary">Se algo crítico acontecer, você será alertado imediatamente.</span>
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default AgentMonitoring;
