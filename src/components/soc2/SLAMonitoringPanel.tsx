/**
 * Painel de Monitoramento de SLA
 * Baseado nos SLOs definidos em docs/compliance/SLA_SLO.md
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Activity, Clock, Server, Shield, Zap, AlertTriangle, CheckCircle2, TrendingUp } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';

interface SLAMetric {
  name: string;
  category: 'availability' | 'performance' | 'support' | 'data';
  current: number;
  slo: number;
  sla: number;
  unit: string;
  status: 'healthy' | 'warning' | 'critical';
  icon: typeof Activity;
}

function getMetricStatus(current: number, slo: number, sla: number, isLatency: boolean): 'healthy' | 'warning' | 'critical' {
  if (isLatency) {
    if (current <= slo) return 'healthy';
    if (current <= sla) return 'warning';
    return 'critical';
  }
  if (current >= slo) return 'healthy';
  if (current >= sla) return 'warning';
  return 'critical';
}

export function SLAMonitoringPanel() {
  const { tenant } = useTenant();

  const { data: metrics, isLoading } = useQuery({
    queryKey: ['sla-metrics', tenant?.id],
    queryFn: async (): Promise<SLAMetric[]> => {
      if (!tenant?.id) return [];

      // Fetch real metrics from performance_metrics and system data
      const now = new Date();
      const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const last30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

      const [perfRes, agentsRes, jobsRes, heartbeatRes] = await Promise.all([
        supabase
          .from('performance_metrics')
          .select('function_name, duration_ms, status_code')
          .gte('created_at', last24h)
          .limit(500),
        supabase
          .from('agents')
          .select('id, status, last_heartbeat')
          .eq('tenant_id', tenant.id),
        supabase
          .from('jobs')
          .select('id, status, created_at, completed_at')
          .eq('tenant_id', tenant.id)
          .gte('created_at', last24h),
        supabase
          .from('agents')
          .select('id, last_heartbeat')
          .eq('tenant_id', tenant.id)
          .eq('status', 'online'),
      ]);

      const perfData = perfRes.data || [];
      const agents = agentsRes.data || [];
      const jobs = jobsRes.data || [];
      const onlineAgents = heartbeatRes.data || [];

      // Calculate API Latency (p95)
      const apiDurations = perfData.map(p => p.duration_ms).filter(Boolean).sort((a, b) => (a ?? 0) - (b ?? 0));
      const p95Index = Math.floor(apiDurations.length * 0.95);
      const apiLatencyP95 = apiDurations.length > 0 ? (apiDurations[p95Index] ?? 0) : 0;

      // Calculate Heartbeat success rate
      const totalAgents = agents.length;
      const onlineCount = onlineAgents.length;
      const heartbeatRate = totalAgents > 0 ? (onlineCount / totalAgents) * 100 : 100;

      // Calculate Job success rate
      const completedJobs = jobs.filter(j => j.status === 'completed').length;
      const failedJobs = jobs.filter(j => j.status === 'failed').length;
      const totalFinished = completedJobs + failedJobs;
      const jobSuccessRate = totalFinished > 0 ? (completedJobs / totalFinished) * 100 : 100;

      // Calculate uptime (based on errors in perf metrics)
      const totalRequests = perfData.length;
      const successRequests = perfData.filter(p => (p.status_code ?? 200) < 500).length;
      const uptimePercent = totalRequests > 0 ? (successRequests / totalRequests) * 100 : 99.9;

      // Calculate avg job delivery time
      const jobDeliveryTimes = jobs
        .filter(j => j.completed_at && j.created_at)
        .map(j => new Date(j.completed_at!).getTime() - new Date(j.created_at).getTime());
      const avgJobDelivery = jobDeliveryTimes.length > 0
        ? jobDeliveryTimes.reduce((a, b) => a + b, 0) / jobDeliveryTimes.length / 1000
        : 0;

      return [
        {
          name: 'Disponibilidade (Uptime)',
          category: 'availability',
          current: Number(uptimePercent.toFixed(2)),
          slo: 99.9,
          sla: 99.5,
          unit: '%',
          status: getMetricStatus(uptimePercent, 99.9, 99.5, false),
          icon: Server,
        },
        {
          name: 'Latência API (p95)',
          category: 'performance',
          current: Math.round(apiLatencyP95),
          slo: 200,
          sla: 500,
          unit: 'ms',
          status: getMetricStatus(apiLatencyP95, 200, 500, true),
          icon: Zap,
        },
        {
          name: 'Taxa de Heartbeat',
          category: 'data',
          current: Number(heartbeatRate.toFixed(1)),
          slo: 99.5,
          sla: 99.0,
          unit: '%',
          status: getMetricStatus(heartbeatRate, 99.5, 99.0, false),
          icon: Activity,
        },
        {
          name: 'Taxa de Sucesso de Jobs',
          category: 'data',
          current: Number(jobSuccessRate.toFixed(1)),
          slo: 99.0,
          sla: 98.0,
          unit: '%',
          status: getMetricStatus(jobSuccessRate, 99.0, 98.0, false),
          icon: CheckCircle2,
        },
        {
          name: 'Entrega de Jobs (média)',
          category: 'performance',
          current: Number(avgJobDelivery.toFixed(1)),
          slo: 1,
          sla: 3,
          unit: 's',
          status: getMetricStatus(avgJobDelivery, 1, 3, true),
          icon: Clock,
        },
      ];
    },
    enabled: !!tenant?.id,
    refetchInterval: 60000, // Refresh every minute
  });

  const statusConfig = {
    healthy: { color: 'text-green-500', bg: 'bg-green-500/10', label: 'Saudável', border: 'border-green-500/20' },
    warning: { color: 'text-yellow-500', bg: 'bg-yellow-500/10', label: 'Atenção', border: 'border-yellow-500/20' },
    critical: { color: 'text-red-500', bg: 'bg-red-500/10', label: 'Crítico', border: 'border-red-500/20' },
  };

  const overallHealth = metrics?.every(m => m.status === 'healthy')
    ? 'healthy'
    : metrics?.some(m => m.status === 'critical')
      ? 'critical'
      : 'warning';

  return (
    <div className="space-y-6">
      {/* Header Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Status Geral do SLA
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              {overallHealth === 'healthy' ? (
                <CheckCircle2 className="h-6 w-6 text-green-500" />
              ) : overallHealth === 'warning' ? (
                <AlertTriangle className="h-6 w-6 text-yellow-500" />
              ) : (
                <AlertTriangle className="h-6 w-6 text-red-500" />
              )}
              <span className={`text-xl font-bold ${statusConfig[overallHealth].color}`}>
                {statusConfig[overallHealth].label}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {metrics?.filter(m => m.status === 'healthy').length || 0}/{metrics?.length || 0} métricas dentro do SLO
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Server className="h-4 w-4 text-primary" />
              Uptime Mensal
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {metrics?.find(m => m.name.includes('Uptime'))?.current || '—'}%
            </div>
            <p className="text-xs text-muted-foreground">Meta SLO: 99.9%</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              Latência API (p95)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {metrics?.find(m => m.name.includes('Latência'))?.current || '—'}ms
            </div>
            <p className="text-xs text-muted-foreground">Meta SLO: &lt;200ms</p>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Metrics Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Métricas de SLA/SLO
          </CardTitle>
          <CardDescription>
            Indicadores de nível de serviço em tempo real
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Métrica</TableHead>
                <TableHead className="text-center">Atual</TableHead>
                <TableHead className="text-center">SLO (Meta)</TableHead>
                <TableHead className="text-center">SLA (Acordo)</TableHead>
                <TableHead className="text-center">Margem</TableHead>
                <TableHead className="text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    Carregando métricas...
                  </TableCell>
                </TableRow>
              ) : metrics?.map((metric) => {
                const cfg = statusConfig[metric.status];
                const isLatency = metric.unit === 'ms' || metric.unit === 's';
                const margin = isLatency
                  ? metric.sla - metric.current
                  : metric.current - metric.sla;
                const Icon = metric.icon;

                return (
                  <TableRow key={metric.name}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Icon className={`h-4 w-4 ${cfg.color}`} />
                        {metric.name}
                      </div>
                    </TableCell>
                    <TableCell className="text-center font-mono font-bold">
                      {metric.current}{metric.unit}
                    </TableCell>
                    <TableCell className="text-center font-mono text-muted-foreground">
                      {isLatency ? '<' : '≥'}{metric.slo}{metric.unit}
                    </TableCell>
                    <TableCell className="text-center font-mono text-muted-foreground">
                      {isLatency ? '<' : '≥'}{metric.sla}{metric.unit}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className={cfg.color}>
                        {margin > 0 ? '+' : ''}{margin.toFixed(1)}{metric.unit}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge className={`${cfg.bg} ${cfg.color} ${cfg.border} border`}>
                        {cfg.label}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* SLA Credit Rules */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Regras de Crédito de SLA</CardTitle>
          <CardDescription>Créditos aplicáveis conforme contrato</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 rounded-lg bg-muted/30 text-center">
              <p className="text-xs text-muted-foreground">99.0% - 99.9%</p>
              <p className="text-lg font-bold text-yellow-500">10%</p>
              <p className="text-xs text-muted-foreground">do valor mensal</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/30 text-center">
              <p className="text-xs text-muted-foreground">95.0% - 99.0%</p>
              <p className="text-lg font-bold text-orange-500">25%</p>
              <p className="text-xs text-muted-foreground">do valor mensal</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/30 text-center">
              <p className="text-xs text-muted-foreground">&lt; 95.0%</p>
              <p className="text-lg font-bold text-red-500">50%</p>
              <p className="text-xs text-muted-foreground">do valor mensal</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
