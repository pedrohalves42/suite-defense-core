import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useTenant } from "@/hooks/useTenant";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Activity, Heart, AlertCircle, Server, Clock, Monitor } from "lucide-react";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ErrorState } from "@/components/ErrorState";
import { InstallationHealthCard } from "@/components/admin/InstallationHealthCard";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useAgentMetricsHistory } from "@/hooks/useAgentMetricsHistory";
import { format, eachDayOfInterval, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

export default function AgentHealthMonitor() {
  const { tenant } = useTenant();
  const [liveHeartbeats, setLiveHeartbeats] = useState<number>(0);
  const [recentHeartbeats, setRecentHeartbeats] = useState<string[]>([]);

  // Fetch agent health metrics using RPC
  const { data: agentsHealth = [], isLoading, isError, error: errorData, refetch } = useQuery({
    queryKey: ['agent-health', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const { data, error } = await supabase
        .rpc('get_agent_health_metrics', { p_tenant_id: tenant.id });
      if (error) throw error;
      return data;
    },
    enabled: !!tenant?.id,
    refetchInterval: 30000, // 30s
  });

  // Fetch historical metrics
  const { data: metricsHistory = [] } = useAgentMetricsHistory(tenant?.id, 7);

  // Process metrics for charts
  const processMetricsForCharts = () => {
    const last7Days = eachDayOfInterval({
      start: subDays(new Date(), 6),
      end: new Date(),
    });

    return last7Days.map(day => {
      const dayStr = format(day, 'yyyy-MM-dd');
      const dayLabel = format(day, 'dd/MM', { locale: ptBR });
      
      // Filter metrics for this day
      const dayMetrics = metricsHistory.filter(m => 
        m.collected_at.startsWith(dayStr)
      );
      
      // Calculate averages
      const avgCpu = dayMetrics.length > 0
        ? dayMetrics.reduce((sum, m) => sum + (m.cpu_usage_percent || 0), 0) / dayMetrics.length
        : 0;
      
      const avgMemory = dayMetrics.length > 0
        ? dayMetrics.reduce((sum, m) => sum + (m.memory_usage_percent || 0), 0) / dayMetrics.length
        : 0;
      
      const avgDisk = dayMetrics.length > 0
        ? dayMetrics.reduce((sum, m) => sum + (m.disk_usage_percent || 0), 0) / dayMetrics.length
        : 0;
      
      return {
        date: dayLabel,
        cpu: Math.round(avgCpu * 10) / 10,
        memory: Math.round(avgMemory * 10) / 10,
        disk: Math.round(avgDisk * 10) / 10,
      };
    });
  };

  const chartData = processMetricsForCharts();

  // Realtime subscription for heartbeats
  useEffect(() => {
    if (!tenant?.id) return;

    const channel = supabase
      .channel('agent-heartbeats')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'agents',
          filter: `tenant_id=eq.${tenant.id}`
        },
        (payload: any) => {
          const agentName = payload.new.agent_name;
          setLiveHeartbeats(prev => prev + 1);
          setRecentHeartbeats(prev => [agentName, ...prev.slice(0, 4)]);
          
          toast.success(`?? Heartbeat recebido`, {
            description: `Agente: ${agentName}`,
            duration: 2000
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenant?.id]);

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="container mx-auto p-6">
        <ErrorState 
          error={errorData!} 
          onRetry={refetch}
          title="Erro ao Carregar Monitor de Saude"
        />
      </div>
    );
  }

  // Calculate health counts from real data
  const counts = agentsHealth.reduce(
    (acc, agent) => {
      if (agent.health_status === 'healthy') acc.healthy++;
      if (agent.health_status === 'critical') acc.critical++;
      if (agent.health_status === 'offline') acc.offline++;
      if (agent.health_status === 'never_connected') acc.never_connected++;
      return acc;
    },
    { healthy: 0, critical: 0, offline: 0, never_connected: 0 }
  );

  const totalAgents = agentsHealth.length || 0;
  const healthPercentage = totalAgents > 0 
    ? Math.round((counts.healthy / totalAgents) * 100)
    : 0;

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Monitor de Saude dos Agentes</h1>
        <p className="text-muted-foreground">Acompanhamento em tempo real do status de todos os agentes</p>
      </div>

      {/* Installation Health Card */}
      <InstallationHealthCard />

      {/* Live Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Saude Geral</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{healthPercentage}%</div>
            <p className="text-xs text-muted-foreground">
              {counts.healthy} de {totalAgents} saudaveis
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Heartbeats Live</CardTitle>
            <Heart className="h-4 w-4 text-red-500 animate-pulse" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{liveHeartbeats}</div>
            <p className="text-xs text-muted-foreground">
              Recebidos nesta sessao
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Alertas Ativos</CardTitle>
            <AlertCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{counts.critical}</div>
            <p className="text-xs text-muted-foreground">
              Requerem atencao
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Offline</CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{counts.offline}</div>
            <p className="text-xs text-muted-foreground">
              Offline temporariamente
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Heartbeats */}
      {recentHeartbeats.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Heart className="h-5 w-5 text-red-500" />
              Heartbeats Recentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {recentHeartbeats.map((name, idx) => (
                <Badge key={`${name}-${idx}`} variant="outline" className="animate-pulse">
                  {name}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Historical Metrics Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* CPU Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Monitor className="h-5 w-5 text-blue-500" />
              Uso de CPU - Últimos 7 Dias
            </CardTitle>
            <CardDescription>Média diária de uso do processador</CardDescription>
          </CardHeader>
          <CardContent>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                    stroke="hsl(var(--muted-foreground))"
                  />
                  <YAxis 
                    domain={[0, 100]}
                    tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                    stroke="hsl(var(--muted-foreground))"
                    label={{ value: '%', position: 'insideLeft', fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <RechartsTooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                    formatter={(value: number) => [`${value}%`, 'CPU']}
                  />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="cpu" 
                    stroke="#3b82f6" 
                    strokeWidth={2}
                    dot={{ fill: '#3b82f6', r: 4 }}
                    activeDot={{ r: 6 }}
                    name="CPU (%)"
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[250px] text-muted-foreground">
                Sem dados de CPU nos últimos 7 dias
              </div>
            )}
          </CardContent>
        </Card>

        {/* Memory Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-green-500" />
              Uso de Memória - Últimos 7 Dias
            </CardTitle>
            <CardDescription>Média diária de uso de RAM</CardDescription>
          </CardHeader>
          <CardContent>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                    stroke="hsl(var(--muted-foreground))"
                  />
                  <YAxis 
                    domain={[0, 100]}
                    tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                    stroke="hsl(var(--muted-foreground))"
                    label={{ value: '%', position: 'insideLeft', fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <RechartsTooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                    formatter={(value: number) => [`${value}%`, 'RAM']}
                  />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="memory" 
                    stroke="#10b981" 
                    strokeWidth={2}
                    dot={{ fill: '#10b981', r: 4 }}
                    activeDot={{ r: 6 }}
                    name="RAM (%)"
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[250px] text-muted-foreground">
                Sem dados de memória nos últimos 7 dias
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Disk Chart - Full Width */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5 text-orange-500" />
            Uso de Disco - Últimos 7 Dias
          </CardTitle>
          <CardDescription>Média diária de uso de armazenamento</CardDescription>
        </CardHeader>
        <CardContent>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="date" 
                  tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                  stroke="hsl(var(--muted-foreground))"
                />
                <YAxis 
                  domain={[0, 100]}
                  tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                  stroke="hsl(var(--muted-foreground))"
                  label={{ value: '%', position: 'insideLeft', fill: 'hsl(var(--muted-foreground))' }}
                />
                <RechartsTooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px'
                  }}
                  formatter={(value: number) => [`${value}%`, 'Disco']}
                />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="disk" 
                  stroke="#f97316" 
                  strokeWidth={2}
                  dot={{ fill: '#f97316', r: 4 }}
                  activeDot={{ r: 6 }}
                  name="Disco (%)"
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[300px] text-muted-foreground">
              Sem dados de disco nos últimos 7 dias
            </div>
          )}
        </CardContent>
      </Card>

      {/* Heatmap Grid */}
      <Card>
        <CardHeader>
          <CardTitle>Mapa de Calor de Agentes</CardTitle>
          <CardDescription>
            <div className="flex gap-4 items-center mt-2">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-green-500 rounded" />
                <span className="text-sm">Saudavel</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-orange-500 rounded" />
                <span className="text-sm">Offline</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-red-500 rounded" />
                <span className="text-sm">Critico</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-gray-500 rounded" />
                <span className="text-sm">Nunca Conectou</span>
              </div>
            </div>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TooltipProvider>
            <div className="grid grid-cols-8 gap-2">
              {agentsHealth.map((agent) => (
                <Tooltip key={agent.agent_name}>
                  <TooltipTrigger asChild>
                    <div 
                      className={cn(
                        "h-16 rounded-lg cursor-pointer hover:opacity-80 transition-opacity flex items-center justify-center",
                        agent.health_status === 'healthy' && 'bg-green-500',
                        agent.health_status === 'offline' && 'bg-orange-500',
                        agent.health_status === 'critical' && 'bg-red-500',
                        agent.health_status === 'never_connected' && 'bg-gray-500'
                      )}
                    >
                      <Server className="h-6 w-6 text-white" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="space-y-1">
                      <p className="font-semibold">{agent.agent_name}</p>
                      <p className="text-sm capitalize">{agent.health_status}</p>
                      {agent.seconds_since_heartbeat !== null && (
                        <p className="text-xs text-muted-foreground">
                          Ultimo heartbeat: {Math.floor(agent.seconds_since_heartbeat / 60)}min atras
                        </p>
                      )}
                      {agent.total_jobs_24h > 0 && (
                        <p className="text-xs">
                          Jobs: {agent.total_jobs_24h} (falhas: {agent.failure_rate_pct}%)
                        </p>
                      )}
                    </div>
                  </TooltipContent>
                </Tooltip>
              ))}
              {/* Fill empty squares to complete grid */}
              {Array.from({ length: Math.max(0, 8 - (agentsHealth.length % 8 || 8)) }).map((_, idx) => (
                <div key={`empty-${idx}`} className="h-16 rounded-lg border-2 border-dashed border-gray-200" />
              ))}
            </div>
          </TooltipProvider>
        </CardContent>
      </Card>

      {/* Detailed Agent Health List - ja implementado acima nas linhas 209-273 */}
    </div>
  );
}
