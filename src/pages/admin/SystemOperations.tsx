import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTenant } from "@/hooks/useTenant";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { 
  Activity, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  Server, 
  Trash2,
  RefreshCw,
  Zap,
  Database,
  BarChart3
} from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { logger } from '@/lib/logger';
import {
import { useAdaptivePolling } from '@/hooks/useAdaptivePolling';
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface StuckJob {
  id: string;
  agent_name: string;
  type: string;
  status: string;
  tenant_id: string;
  created_at: string;
  delivered_at: string | null;
  minutes_stuck: number;
  stuck_reason: string; // Aligned with v_stuck_jobs_report view (ADR-026)
}

interface EdgeFunctionStat {
  function_name: string;
  total_calls: number;
  successful_calls: number;
  failed_calls: number;
  avg_latency_ms: number;
  p50_latency_ms: number;
  p95_latency_ms: number;
  p99_latency_ms: number;
  min_latency_ms: number;
  max_latency_ms: number;
  first_call: string;
  last_call: string;
}

interface OperationsSummary {
  tenant_id: string;
  tenant_name: string;
  total_agents: number;
  online_agents: number;
  offline_agents: number;
  jobs_24h: number;
  jobs_completed_24h: number;
  jobs_failed_24h: number;
  open_alerts: number;
}

export default function SystemOperations() {
  const adaptiveInterval = useAdaptivePolling(300000);
  const { tenant } = useTenant();
  const queryClient = useQueryClient();

  // Fetch operations summary
  const { data: summary, isLoading: loadingSummary } = useQuery({
    queryKey: ['system-operations-summary', tenant?.id],
    queryFn: async () => {
      // Using type assertion until types are regenerated after migration
      const { data, error } = await (supabase )
        .from('v_system_operations_summary')
        .select('*')
        .single();
      if (error) throw error;
      return data as unknown as OperationsSummary;
    },
    enabled: !!tenant?.id,
    refetchInterval: adaptiveInterval,
  });

  // Fetch stuck jobs
  const { data: stuckJobs = [], isLoading: loadingStuck } = useQuery({
    queryKey: ['stuck-jobs-report', tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_stuck_jobs_report')
        .select('*')
        .order('minutes_stuck', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data as StuckJob[];
    },
    enabled: !!tenant?.id,
    refetchInterval: adaptiveInterval,
  });

  // Fetch Edge Function stats
  const { data: efStats = [], isLoading: loadingEF } = useQuery({
    queryKey: ['edge-function-stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_edge_function_stats')
        .select('*')
        .order('total_calls', { ascending: false })
        .limit(15);
      if (error) throw error;
      return data as EdgeFunctionStat[];
    },
    refetchInterval: adaptiveInterval,
  });

  // Cleanup stuck jobs mutation
  const cleanupMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('cleanup-stuck-jobs', {
        body: { tenant_id: tenant?.id }
      });
      if (error) throw error;
      return data;
    },
    onMutate: () => {
      toast.loading('Limpando jobs travados...', { id: 'cleanup-stuck' });
    },
    onSuccess: (data) => {
      toast.success(`${data?.cleaned_count || 0} jobs travados limpos`, { id: 'cleanup-stuck' });
      queryClient.invalidateQueries({ queryKey: ['stuck-jobs-report'] });
      queryClient.invalidateQueries({ queryKey: ['system-operations-summary'] });
    },
    onError: (error) => {
      toast.error('Erro ao limpar jobs travados', { id: 'cleanup-stuck', description: error.message });
      logger.error('Cleanup stuck jobs failed', error);
    }
  });

  // Run manual cleanup
  const runCleanupMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('cleanup_old_data_scheduled');
      if (error) throw error;
      return data;
    },
    onMutate: () => {
      toast.loading('Executando limpeza do sistema...', { id: 'run-cleanup' });
    },
    onSuccess: (data) => {
      const result = data as Record<string, number | string>;
      toast.success('Limpeza executada com sucesso', {
        id: 'run-cleanup',
        description: `HMAC: ${result.hmac_deleted || 0}, Rate Limits: ${result.rate_limits_deleted || 0}, Logins: ${result.failed_logins_deleted || 0}`
      });
      queryClient.invalidateQueries({ queryKey: ['system-operations-summary'] });
    },
    onError: (error) => {
      toast.error('Erro na limpeza', { id: 'run-cleanup', description: error.message });
      logger.error('System cleanup failed', error);
    }
  });

  // Manual refresh
  const handleRefresh = () => {
    toast.loading('Atualizando dados...', { id: 'refresh-ops' });
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['system-operations-summary'] }),
      queryClient.invalidateQueries({ queryKey: ['stuck-jobs-report'] }),
      queryClient.invalidateQueries({ queryKey: ['edge-function-stats'] }),
    ]).then(() => {
      toast.success('Dados atualizados', { id: 'refresh-ops' });
    });
  };

  const isLoading = loadingSummary || loadingStuck || loadingEF;

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  const jobSuccessRate = summary && summary.jobs_24h > 0
    ? Math.round((summary.jobs_completed_24h / summary.jobs_24h) * 100)
    : 100;

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Operações do Sistema</h1>
          <p className="text-muted-foreground">
            Monitoramento de saúde, latência e automação
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => runCleanupMutation.mutate()}
            disabled={runCleanupMutation.isPending}
          >
            <Trash2 className={cn("h-4 w-4 mr-2", runCleanupMutation.isPending && "animate-pulse")} />
            {runCleanupMutation.isPending ? 'Limpando...' : 'Executar Limpeza'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0 }}
        >
          <Card className={cn(
            "border-l-4",
            summary?.offline_agents === 0 ? "border-green-500" : "border-yellow-500"
          )}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Server className="h-4 w-4" />
                Computadores
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {summary?.online_agents || 0}/{summary?.total_agents || 0}
              </div>
              <p className="text-xs text-muted-foreground">
                {summary?.offline_agents || 0} offline
              </p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className={cn(
            "border-l-4",
            jobSuccessRate >= 90 ? "border-green-500" : 
            jobSuccessRate >= 70 ? "border-yellow-500" : "border-red-500"
          )}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Taxa de Sucesso (24h)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{jobSuccessRate}%</div>
              <p className="text-xs text-muted-foreground">
                {summary?.jobs_completed_24h || 0} de {summary?.jobs_24h || 0} jobs
              </p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className={cn(
            "border-l-4",
            stuckJobs.length === 0 ? "border-green-500" : "border-red-500"
          )}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Jobs Travados
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stuckJobs.length}</div>
              <p className="text-xs text-muted-foreground">
                {stuckJobs.length > 0 ? `Mais antigo: ${Math.round(stuckJobs[0]?.minutes_stuck || 0)} min` : 'Nenhum travado'}
              </p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card className={cn(
            "border-l-4",
            (summary?.open_alerts || 0) === 0 ? "border-green-500" : "border-orange-500"
          )}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Alertas Ativos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary?.open_alerts || 0}</div>
              <p className="text-xs text-muted-foreground">
                Alertas em aberto
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Edge Function Latency Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-yellow-500" />
            Latência de Edge Functions (24h)
          </CardTitle>
          <CardDescription>
            Métricas de performance p50/p95/p99 em milissegundos
          </CardDescription>
        </CardHeader>
        <CardContent>
          {efStats.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <BarChart3 className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>Nenhuma métrica de latência registrada ainda.</p>
              <p className="text-sm">As métricas serão coletadas automaticamente.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Função</TableHead>
                  <TableHead className="text-right">Chamadas</TableHead>
                  <TableHead className="text-right">Taxa Sucesso</TableHead>
                  <TableHead className="text-right">p50</TableHead>
                  <TableHead className="text-right">p95</TableHead>
                  <TableHead className="text-right">p99</TableHead>
                  <TableHead className="text-right">Max</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {efStats.map((stat) => {
                  const successRate = stat.total_calls > 0
                    ? Math.round((stat.successful_calls / stat.total_calls) * 100)
                    : 100;
                  return (
                    <TableRow key={stat.function_name}>
                      <TableCell className="font-mono text-sm">
                        {stat.function_name}
                      </TableCell>
                      <TableCell className="text-right">{stat.total_calls}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={successRate >= 95 ? "default" : successRate >= 80 ? "secondary" : "destructive"}>
                          {successRate}%
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {Math.round(stat.p50_latency_ms || 0)}ms
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        <span className={cn(
                          (stat.p95_latency_ms || 0) > 1000 && "text-yellow-600"
                        )}>
                          {Math.round(stat.p95_latency_ms || 0)}ms
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        <span className={cn(
                          (stat.p99_latency_ms || 0) > 2000 && "text-red-600"
                        )}>
                          {Math.round(stat.p99_latency_ms || 0)}ms
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">
                        {Math.round(stat.max_latency_ms || 0)}ms
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Stuck Jobs Table */}
      {stuckJobs.length > 0 && (
        <Card className="border-red-200 dark:border-red-900">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-red-600">
                  <AlertTriangle className="h-5 w-5" />
                  Jobs Travados ({stuckJobs.length})
                </CardTitle>
                <CardDescription>
                  Jobs que não completaram no tempo esperado
                </CardDescription>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => cleanupMutation.mutate()}
                disabled={cleanupMutation.isPending}
              >
                <Trash2 className={cn("h-4 w-4 mr-2", cleanupMutation.isPending && "animate-pulse")} />
                {cleanupMutation.isPending ? 'Limpando...' : 'Limpar Todos'}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Computador</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Problema</TableHead>
                  <TableHead className="text-right">Tempo Travado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stuckJobs.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell className="font-medium">{job.agent_name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{job.type}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={
                        job.status === 'delivered' ? 'secondary' :
                        job.status === 'queued' ? 'outline' : 'destructive'
                      }>
                        {job.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="destructive" className="text-xs">
                        {job.stuck_reason.replace('stuck_', '').toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {Math.round(job.minutes_stuck)} min
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Automation Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5 text-blue-500" />
            Status de Automação
          </CardTitle>
          <CardDescription>
            Tarefas agendadas e limpeza automática
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="p-4 rounded-lg bg-muted/50">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span className="font-medium">Limpeza HMAC</span>
              </div>
              <p className="text-sm text-muted-foreground">
                A cada hora - Remove assinaturas &gt; 6h
              </p>
            </div>
            <div className="p-4 rounded-lg bg-muted/50">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span className="font-medium">Limpeza Rate Limits</span>
              </div>
              <p className="text-sm text-muted-foreground">
                A cada hora - Remove registros &gt; 30min
              </p>
            </div>
            <div className="p-4 rounded-lg bg-muted/50">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span className="font-medium">Detecção Jobs Travados</span>
              </div>
              <p className="text-sm text-muted-foreground">
                A cada 15 min - Alerta jobs &gt; 30min
              </p>
            </div>
            <div className="p-4 rounded-lg bg-muted/50">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span className="font-medium">Verificação de Quotas</span>
              </div>
              <p className="text-sm text-muted-foreground">
                A cada 6h - Alerta quando &gt; 80%
              </p>
            </div>
            <div className="p-4 rounded-lg bg-muted/50">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span className="font-medium">Limpeza de Jobs Antigos</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Diário - Remove jobs completed &gt; 30 dias
              </p>
            </div>
            <div className="p-4 rounded-lg bg-muted/50">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span className="font-medium">Métricas Edge Functions</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Semanal - Remove métricas &gt; 7 dias
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
