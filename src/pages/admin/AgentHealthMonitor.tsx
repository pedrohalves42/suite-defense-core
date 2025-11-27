import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTenant } from "@/hooks/useTenant";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Activity, Heart, AlertCircle, Server, Clock, Monitor, Trash2, HardDrive } from "lucide-react";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ErrorState } from "@/components/ErrorState";
import { InstallationHealthCard } from "@/components/admin/InstallationHealthCard";
import { QuickValidationJobs } from "@/components/admin/QuickValidationJobs";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useAgentMetricsHistory } from "@/hooks/useAgentMetricsHistory";
import { format, eachDayOfInterval, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import { motion } from 'framer-motion';
import { Skeleton } from '@/components/ui/skeleton';

export default function AgentHealthMonitor() {
  const { tenant } = useTenant();
  const [liveHeartbeats, setLiveHeartbeats] = useState<number>(0);
  const [recentHeartbeats, setRecentHeartbeats] = useState<string[]>([]);
  const [isCleaningJobs, setIsCleaningJobs] = useState(false);

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

  // Fetch job statistics
  const { data: jobStats, refetch: refetchJobStats } = useQuery({
    queryKey: ['job-stats', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return { failed: 0, delivered: 0, total: 0 };
      
      const { data, error } = await supabase
        .from('jobs')
        .select('status', { count: 'exact' })
        .eq('tenant_id', tenant.id);
      
      if (error) throw error;
      
      const failed = data.filter(j => j.status === 'failed').length;
      const delivered = data.filter(j => j.status === 'delivered').length;
      
      return { failed, delivered, total: data.length };
    },
    enabled: !!tenant?.id,
    refetchInterval: 60000, // 1 min
  });

  // Cleanup jobs function
  const handleCleanup = async (type: 'failed' | 'delivered' | 'all') => {
    const statusMap = {
      failed: ['failed'],
      delivered: ['delivered'],
      all: ['failed', 'delivered']
    };

    const confirmMessage = 
      type === 'failed' ? `Deletar ${jobStats?.failed || 0} jobs failed?` :
      type === 'delivered' ? `Deletar ${jobStats?.delivered || 0} jobs stuck?` :
      `Deletar ${(jobStats?.failed || 0) + (jobStats?.delivered || 0)} jobs (failed + stuck)?`;

    if (!confirm(confirmMessage)) return;

    setIsCleaningJobs(true);

    try {
      const { data, error } = await supabase.functions.invoke('cleanup-jobs', {
        body: {
          status: statusMap[type],
          older_than_days: 0  // Deletar jobs de qualquer idade
        }
      });

      if (error) throw error;

      toast.success(`${data.deleted_count} jobs deletados com sucesso`);
      refetchJobStats();
    } catch (error) {
      console.error('Cleanup error:', error);
      toast.error('Erro ao limpar jobs');
    } finally {
      setIsCleaningJobs(false);
    }
  };

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
        (payload: { new: { agent_name: string } }) => {
          const agentName = payload.new.agent_name;
          setLiveHeartbeats(prev => prev + 1);
          setRecentHeartbeats(prev => [agentName, ...prev.slice(0, 4)]);
          
          toast.success(`💗 Heartbeat recebido`, {
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
      <div className="container mx-auto p-6 space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-9 w-80" />
          <Skeleton className="h-5 w-96" />
        </div>
        
        <Skeleton className="h-32 w-full" />
        
        <div className="grid gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.1 }}
            >
              <Card className="p-6">
                <div className="space-y-3">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-8 w-16" />
                  <Skeleton className="h-3 w-32" />
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
        
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-80 w-full" />
          <Skeleton className="h-80 w-full" />
        </div>
        <Skeleton className="h-96 w-full" />
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

      {/* Quick Validation Jobs */}
      <QuickValidationJobs />

      {/* Live Statistics */}
      <div className="grid gap-4 md:grid-cols-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0 }}
        >
          <Card className="border-l-4 border-green-500 bg-gradient-to-br from-green-50/50 to-transparent dark:from-green-950/30 dark:to-transparent hover:shadow-lg transition-all duration-300">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Saúde Geral</CardTitle>
              <Activity className="h-5 w-5 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600 dark:text-green-400">
                {healthPercentage}%
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {counts.healthy} de {totalAgents} saudáveis
              </p>
              <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-green-500 transition-all duration-500"
                  style={{ width: `${healthPercentage}%` }}
                />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <Card className="border-l-4 border-red-500 bg-gradient-to-br from-red-50/50 to-transparent dark:from-red-950/30 dark:to-transparent hover:shadow-lg transition-all duration-300">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Heartbeats Live</CardTitle>
              <Heart className="h-5 w-5 text-red-500 animate-pulse" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-red-600 dark:text-red-400">
                {liveHeartbeats}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Recebidos nesta sessão
              </p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          <Card className="border-l-4 border-yellow-500 bg-gradient-to-br from-yellow-50/50 to-transparent dark:from-yellow-950/30 dark:to-transparent hover:shadow-lg transition-all duration-300">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Alertas Ativos</CardTitle>
              <AlertCircle className="h-5 w-5 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-yellow-600 dark:text-yellow-400">
                {counts.critical}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Requerem atenção
              </p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
        >
          <Card className="border-l-4 border-gray-400 bg-gradient-to-br from-gray-50/50 to-transparent dark:from-gray-950/30 dark:to-transparent hover:shadow-lg transition-all duration-300">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Offline</CardTitle>
              <Clock className="h-5 w-5 text-gray-500" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-gray-600 dark:text-gray-400">
                {counts.offline}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Offline temporariamente
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Recent Heartbeats */}
      {recentHeartbeats.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Heart className="h-5 w-5 text-red-500" />
              Heartbeats Recentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {recentHeartbeats.map((name, idx) => (
                <motion.div
                  key={`${name}-${idx}`}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ 
                    type: "spring",
                    stiffness: 500,
                    damping: 15,
                    delay: idx * 0.05
                  }}
                >
                  <Badge 
                    variant="outline" 
                    className="px-4 py-2 text-sm font-medium bg-gradient-to-r from-red-50 to-pink-50 dark:from-red-950/30 dark:to-pink-950/30 border-red-200 dark:border-red-800 shadow-sm"
                  >
                    <Heart className="h-3 w-3 mr-2 inline text-red-500" />
                    {name}
                  </Badge>
                </motion.div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* System Maintenance Card */}
      {jobStats && (jobStats.failed > 0 || jobStats.delivered > 0) && (
        <Card className="border-orange-200 bg-orange-50/50 dark:border-orange-900 dark:bg-orange-950/20">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Trash2 className="h-5 w-5 text-orange-600" />
                Manutencao do Sistema
              </span>
            </CardTitle>
            <CardDescription>
              Limpeza de jobs antigos e travados do historico
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground mb-3">
                <span className="font-semibold text-red-600">{jobStats.failed} jobs failed</span>
                {' • '}
                <span className="font-semibold text-yellow-600">{jobStats.delivered} jobs stuck</span>
                {' • '}
                <span className="font-semibold">{jobStats.total} total</span>
              </p>
              <div className="flex flex-wrap gap-2">
                <Button 
                  variant="destructive" 
                  size="sm"
                  onClick={() => handleCleanup('failed')}
                  disabled={isCleaningJobs || jobStats.failed === 0}
                >
                  Limpar Failed ({jobStats.failed})
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => handleCleanup('delivered')}
                  disabled={isCleaningJobs || jobStats.delivered === 0}
                  className="border-yellow-600 text-yellow-700 hover:bg-yellow-50"
                >
                  Limpar Stuck ({jobStats.delivered})
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => handleCleanup('all')}
                  disabled={isCleaningJobs || (jobStats.failed === 0 && jobStats.delivered === 0)}
                >
                  Limpar Tudo ({jobStats.failed + jobStats.delivered})
                </Button>
              </div>
              {isCleaningJobs && (
                <p className="text-xs text-muted-foreground mt-2">
                  Limpando jobs... Aguarde.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Historical Performance Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
        >
          <Card className="hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
            <CardHeader className="border-b border-border/50">
              <CardTitle className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-950/30">
                  <Monitor className="h-5 w-5 text-blue-500" />
                </div>
                Uso de CPU - Últimos 7 Dias
              </CardTitle>
              <CardDescription className="text-xs">
                Média diária de uso do processador em todos os agentes
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="colorCpu" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.1}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" />
                    <XAxis 
                      dataKey="date" 
                      tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                      stroke="hsl(var(--border))"
                    />
                    <YAxis 
                      domain={[0, 100]}
                      tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                      stroke="hsl(var(--border))"
                      label={{ value: '%', position: 'insideLeft', fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <RechartsTooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--popover))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '12px',
                        boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
                        padding: '12px'
                      }}
                      labelStyle={{ fontWeight: 'bold', marginBottom: '8px' }}
                      formatter={(value: number) => [
                        `${value}%`, 
                        'CPU'
                      ]}
                    />
                    <Legend wrapperStyle={{ paddingTop: '20px' }} />
                    <Area 
                      type="monotone" 
                      dataKey="cpu" 
                      stroke="#3b82f6" 
                      strokeWidth={3}
                      fill="url(#colorCpu)"
                      name="CPU %"
                      animationDuration={1500}
                      animationEasing="ease-in-out"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex flex-col items-center justify-center h-[250px] text-muted-foreground">
                  <div className="p-4 rounded-full bg-muted/50 mb-4">
                    <Monitor className="h-12 w-12 text-muted-foreground/50" />
                  </div>
                  <p className="font-medium">Sem dados de CPU nos últimos 7 dias</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">
                    Os agentes começarão a enviar métricas automaticamente
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <Card className="hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
            <CardHeader className="border-b border-border/50">
              <CardTitle className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-green-100 dark:bg-green-950/30">
                  <Server className="h-5 w-5 text-green-500" />
                </div>
                Uso de Memória - Últimos 7 Dias
              </CardTitle>
              <CardDescription className="text-xs">
                Média diária de uso de RAM em todos os agentes
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="colorMemory" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0.1}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" />
                    <XAxis 
                      dataKey="date" 
                      tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                      stroke="hsl(var(--border))"
                    />
                    <YAxis 
                      domain={[0, 100]}
                      tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                      stroke="hsl(var(--border))"
                      label={{ value: '%', position: 'insideLeft', fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <RechartsTooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--popover))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '12px',
                        boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
                        padding: '12px'
                      }}
                      labelStyle={{ fontWeight: 'bold', marginBottom: '8px' }}
                      formatter={(value: number) => [
                        `${value}%`, 
                        'RAM'
                      ]}
                    />
                    <Legend wrapperStyle={{ paddingTop: '20px' }} />
                    <Area 
                      type="monotone" 
                      dataKey="memory" 
                      stroke="#10b981" 
                      strokeWidth={3}
                      fill="url(#colorMemory)"
                      name="RAM %"
                      animationDuration={1500}
                      animationEasing="ease-in-out"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex flex-col items-center justify-center h-[250px] text-muted-foreground">
                  <div className="p-4 rounded-full bg-muted/50 mb-4">
                    <Server className="h-12 w-12 text-muted-foreground/50" />
                  </div>
                  <p className="font-medium">Sem dados de memória nos últimos 7 dias</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">
                    Os agentes começarão a enviar métricas automaticamente
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Disk Usage Chart */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        <Card className="hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
          <CardHeader className="border-b border-border/50">
            <CardTitle className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-950/30">
                <HardDrive className="h-5 w-5 text-orange-500" />
              </div>
              Uso de Disco - Últimos 7 Dias
            </CardTitle>
            <CardDescription className="text-xs">
              Média diária de uso de armazenamento em todos os agentes
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorDisk" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f97316" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#f97316" stopOpacity={0.1}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                    stroke="hsl(var(--border))"
                  />
                  <YAxis 
                    domain={[0, 100]}
                    tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                    stroke="hsl(var(--border))"
                    label={{ value: '%', position: 'insideLeft', fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <RechartsTooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--popover))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '12px',
                      boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
                      padding: '12px'
                    }}
                    labelStyle={{ fontWeight: 'bold', marginBottom: '8px' }}
                    formatter={(value: number) => [
                      `${value}%`, 
                      'Disco'
                    ]}
                  />
                  <Legend wrapperStyle={{ paddingTop: '20px' }} />
                  <Area 
                    type="monotone" 
                    dataKey="disk" 
                    stroke="#f97316" 
                    strokeWidth={3}
                    fill="url(#colorDisk)"
                    name="Disco %"
                    animationDuration={1500}
                    animationEasing="ease-in-out"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground">
                <div className="p-4 rounded-full bg-muted/50 mb-4">
                  <HardDrive className="h-12 w-12 text-muted-foreground/50" />
                </div>
                <p className="font-medium">Sem dados de disco nos últimos 7 dias</p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  Os agentes começarão a enviar métricas automaticamente
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Agent Heatmap */}
      <Card>
        <CardHeader>
          <CardTitle>Agent Heatmap</CardTitle>
          <CardDescription>Visualizacao em tempo real do status de todos os agentes</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-12 gap-3">
            {agentsHealth.map((agent) => {
              const statusColors = {
                healthy: 'text-green-500',
                critical: 'text-red-500',
                offline: 'text-yellow-500',
                never_connected: 'text-gray-400'
              };

              const statusLabels = {
                healthy: 'Saudavel',
                critical: 'Critico',
                offline: 'Offline',
                never_connected: 'Nunca Conectado'
              };

              return (
                <TooltipProvider key={agent.agent_name}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center justify-center p-3 rounded-lg border border-border hover:border-primary transition-colors cursor-pointer">
                        <Server 
                          className={cn(
                            "h-6 w-6",
                            statusColors[agent.health_status as keyof typeof statusColors]
                          )}
                        />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent className="w-64">
                      <div className="space-y-2">
                        <p className="font-semibold">{agent.agent_name}</p>
                        <div className="text-xs space-y-1">
                          <p>Status: <span className={statusColors[agent.health_status as keyof typeof statusColors]}>
                            {statusLabels[agent.health_status as keyof typeof statusLabels]}
                          </span></p>
                          {agent.last_heartbeat && (
                            <p>Ultimo heartbeat: {new Date(agent.last_heartbeat).toLocaleString('pt-BR')}</p>
                          )}
                          {agent.hostname && <p>Hostname: {agent.hostname}</p>}
                          {agent.os_type && <p>OS: {agent.os_type} {agent.os_version}</p>}
                          {agent.agent_version && <p>Versao: {agent.agent_version}</p>}
                          {agent.total_jobs_24h !== undefined && (
                            <p>Jobs 24h: {agent.total_jobs_24h} total, {agent.failed_jobs_24h} failed ({agent.failure_rate_pct}%)</p>
                          )}
                        </div>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              );
            })}
          </div>

          {agentsHealth.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              Nenhum agente encontrado
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
