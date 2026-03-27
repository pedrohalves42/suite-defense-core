import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Activity, Clock, RefreshCw, TrendingUp, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { callEdgeFunction } from '@/lib/edge-function-client';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface SLIData {
  availability: { current: number; target: number; status: string };
  latency: { current: number; target: number; status: string };
  throughput: { current: number; target: number; status: string };
  errorRate: { current: number; target: number; status: string };
}

interface SLOData {
  errorBudget: { total: number; spent: number; remaining: number; status: string };
  burnRate: number;
  estimatedTimeToExhaustion: number | null;
}

interface SLIDashboardProps {
  tenantId: string;
}

const statusIcon = (status: string) => {
  switch (status) {
    case 'healthy': return <CheckCircle2 className="h-4 w-4 text-primary" />;
    case 'warning': return <AlertTriangle className="h-4 w-4 text-accent-foreground" />;
    case 'critical': return <XCircle className="h-4 w-4 text-destructive" />;
    default: return <Activity className="h-4 w-4 text-muted-foreground" />;
  }
};

const statusColor = (status: string) => {
  switch (status) {
    case 'healthy': return 'text-primary';
    case 'warning': return 'text-accent-foreground';
    case 'critical': return 'text-destructive';
    default: return 'text-muted-foreground';
  }
};

export function SLIDashboard({ tenantId }: SLIDashboardProps) {
  const [sli, setSli] = useState<SLIData | null>(null);
  const [slo, setSlo] = useState<SLOData | null>(null);
  const [metrics, setMetrics] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [sliRes, sloRes, dashRes] = await Promise.all([
        callEdgeFunction('sli-collector', { action: 'sli', tenantId }),
        callEdgeFunction('sli-collector', { action: 'slo', tenantId }),
        callEdgeFunction('sli-collector', { action: 'dashboard', tenantId }),
      ]);
      setSli(sliRes);
      setSlo(sloRes);
      setMetrics(dashRes.recentMetrics || []);
    } catch (e) {
      console.error('Failed to load SLI/SLO:', e);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 300_000); // COST-OPT: 60s → 5min
    return () => clearInterval(interval);
  }, [loadData]);

  const chartData = metrics
    .filter(m => m.total_requests > 0)
    .map(m => ({
      hour: new Date(m.hour).toLocaleDateString('pt-BR', { day: '2-digit', hour: '2-digit' }),
      availability: +((m.success_requests / m.total_requests) * 100).toFixed(2),
      latency: Math.round(m.total_latency_ms / m.total_requests),
      errorRate: +((m.error_requests / m.total_requests) * 100).toFixed(2),
    }))
    .reverse()
    .slice(-72);

  return (
    <div className="space-y-6">
      <Alert>
        <Activity className="h-4 w-4" />
        <AlertDescription>
          Métricas de confiabilidade medidas em janela rolling de 30 dias. Atualização a cada minuto.
        </AlertDescription>
      </Alert>

      {/* SLI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {sli && ([
          { label: 'Availability', val: `${sli.availability.current}%`, target: `${sli.availability.target}%`, s: sli.availability.status },
          { label: 'Latency (p95)', val: `${sli.latency.current}ms`, target: `<${sli.latency.target}ms`, s: sli.latency.status },
          { label: 'Throughput', val: `${sli.throughput.current} req/h`, target: `${sli.throughput.target} req/h`, s: sli.throughput.status },
          { label: 'Error Rate', val: `${sli.errorRate.current}%`, target: `<${sli.errorRate.target}%`, s: sli.errorRate.status },
        ] as const).map(item => (
          <Card key={item.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                {statusIcon(item.s)}
                {item.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${statusColor(item.s)}`}>{item.val}</div>
              <p className="text-xs text-muted-foreground mt-1">Target: {item.target}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Error Budget */}
      {slo && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Error Budget
            </CardTitle>
            <CardDescription>
              Budget restante: {slo.errorBudget.remaining}% | Burn rate: {slo.burnRate}x
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Consumido: {slo.errorBudget.spent}%</span>
                <span>Restante: {slo.errorBudget.remaining}%</span>
              </div>
              <Progress value={slo.errorBudget.spent} className="h-3" />
            </div>
            {slo.estimatedTimeToExhaustion !== null && (
              <Alert variant={slo.burnRate > 2 ? 'destructive' : 'default'}>
                <Clock className="h-4 w-4" />
                <AlertDescription>
                  Tempo estimado para exaustão: ~{slo.estimatedTimeToExhaustion}h (burn rate: {slo.burnRate}x)
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {/* Chart */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Tendências (últimas 72h)</span>
              <Button variant="ghost" size="sm" onClick={loadData} disabled={loading}>
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="hour" tick={{ fontSize: 10 }} interval={11} className="text-muted-foreground" />
                <YAxis yAxisId="pct" domain={[0, 100]} tick={{ fontSize: 10 }} />
                <YAxis yAxisId="ms" orientation="right" domain={[0, 'auto']} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Line yAxisId="pct" type="monotone" dataKey="availability" stroke="hsl(var(--primary))" name="Availability %" strokeWidth={2} dot={false} />
                <Line yAxisId="ms" type="monotone" dataKey="latency" stroke="hsl(var(--accent-foreground))" name="Latency ms" strokeWidth={1} dot={false} />
                <Line yAxisId="pct" type="monotone" dataKey="errorRate" stroke="hsl(var(--destructive))" name="Error Rate %" strokeWidth={1} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
