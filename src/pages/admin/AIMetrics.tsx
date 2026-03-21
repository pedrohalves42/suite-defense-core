import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AdminPageLayout } from '@/components/AdminPageLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Brain, Clock, CheckCircle, XCircle, Zap, DollarSign, Activity, TrendingUp } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';
import CVEDatabaseStatus from '@/components/admin/CVEDatabaseStatus';
import { formatBrazilTime } from '@/lib/date-utils';

interface AIMetric {
  id: string;
  function_name: string;
  model: string;
  latency_ms: number;
  success: boolean;
  tokens_prompt: number | null;
  tokens_completion: number | null;
  tokens_total: number | null;
  error: string | null;
  used_fallback: boolean;
  circuit_breaker_state: string | null;
  created_at: string;
}

const CHART_COLORS = ['hsl(var(--primary))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

export default function AIMetrics() {
  const [timeRange, setTimeRange] = useState('24h');
  
  const hoursBack = timeRange === '1h' ? 1 : timeRange === '24h' ? 24 : timeRange === '7d' ? 168 : 720;
  
  const { data: metrics, isLoading } = useQuery({
    queryKey: ['ai-metrics', timeRange],
    queryFn: async () => {
      const cutoffDate = new Date();
      cutoffDate.setHours(cutoffDate.getHours() - hoursBack);
      
      const { data, error } = await supabase
        .from('ai_inference_metrics')
        .select('id, model_name, prompt_tokens, completion_tokens, total_tokens, latency_ms, status, error_message, created_at')
        .gte('created_at', cutoffDate.toISOString())
        .order('created_at', { ascending: false })
        .limit(1000);
      
      if (error) throw error;
      return data as AIMetric[];
    },
    refetchInterval: 300000, // COST-OPT: 30s → 5min
  });
  
  // Calculate summary stats
  const summary = metrics ? {
    totalCalls: metrics.length,
    successRate: metrics.length > 0 
      ? (metrics.filter(m => m.success).length / metrics.length) * 100 
      : 0,
    avgLatency: metrics.length > 0
      ? metrics.reduce((sum, m) => sum + m.latency_ms, 0) / metrics.length
      : 0,
    p95Latency: metrics.length > 0
      ? [...metrics].sort((a, b) => b.latency_ms - a.latency_ms)[Math.floor(metrics.length * 0.05)]?.latency_ms || 0
      : 0,
    totalTokens: metrics.reduce((sum, m) => sum + (m.tokens_total || 0), 0),
    fallbackRate: metrics.length > 0
      ? (metrics.filter(m => m.used_fallback).length / metrics.length) * 100
      : 0,
    estimatedCost: metrics.reduce((sum, m) => {
      // Rough estimate: $0.001 per 1000 tokens
      return sum + ((m.tokens_total || 0) / 1000) * 0.001;
    }, 0),
  } : null;
  
  // Prepare chart data
  const latencyOverTime = metrics?.reduce((acc, m) => {
    const hour = formatBrazilTime(m.created_at);
    const existing = acc.find(item => item.time === hour);
    if (existing) {
      existing.count++;
      existing.totalLatency += m.latency_ms;
      existing.avgLatency = Math.round(existing.totalLatency / existing.count);
    } else {
      acc.push({ time: hour, avgLatency: m.latency_ms, count: 1, totalLatency: m.latency_ms });
    }
    return acc;
  }, [] as Array<{ time: string; avgLatency: number; count: number; totalLatency: number }>).slice(-20) || [];
  
  const byFunction = metrics?.reduce((acc, m) => {
    const existing = acc.find(item => item.name === m.function_name);
    if (existing) {
      existing.calls++;
      existing.success += m.success ? 1 : 0;
      existing.tokens += m.tokens_total || 0;
    } else {
      acc.push({ 
        name: m.function_name, 
        calls: 1, 
        success: m.success ? 1 : 0,
        tokens: m.tokens_total || 0,
      });
    }
    return acc;
  }, [] as Array<{ name: string; calls: number; success: number; tokens: number }>) || [];
  
  const byModel = metrics?.reduce((acc, m) => {
    const existing = acc.find(item => item.name === m.model);
    if (existing) {
      existing.calls++;
      existing.tokens += m.tokens_total || 0;
    } else {
      acc.push({ name: m.model, calls: 1, tokens: m.tokens_total || 0 });
    }
    return acc;
  }, [] as Array<{ name: string; calls: number; tokens: number }>) || [];
  
  const recentErrors = metrics?.filter(m => !m.success).slice(0, 10) || [];
  
  return (
    <AdminPageLayout
      title="Métricas de IA"
      description="Monitoramento de inferências de IA, latência e consumo de tokens"
    >
      <div className="space-y-6">
        {/* Time Range Selector */}
        <div className="flex justify-end">
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Período" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1h">Última hora</SelectItem>
              <SelectItem value="24h">Últimas 24 horas</SelectItem>
              <SelectItem value="7d">Últimos 7 dias</SelectItem>
              <SelectItem value="30d">Últimos 30 dias</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total de Chamadas</CardTitle>
              <Brain className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <div className="text-2xl font-bold">{summary?.totalCalls.toLocaleString()}</div>
              )}
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Taxa de Sucesso</CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold">
                    {summary?.successRate.toFixed(1)}%
                  </span>
                  <Badge variant={summary && summary.successRate >= 95 ? 'default' : 'destructive'}>
                    {summary && summary.successRate >= 95 ? 'Saudável' : 'Atenção'}
                  </Badge>
                </div>
              )}
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Latência Média</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <div className="flex flex-col">
                  <span className="text-2xl font-bold">
                    {Math.round(summary?.avgLatency || 0)}ms
                  </span>
                  <span className="text-xs text-muted-foreground">
                    P95: {Math.round(summary?.p95Latency || 0)}ms
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Tokens Consumidos</CardTitle>
              <Zap className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <div className="flex flex-col">
                  <span className="text-2xl font-bold">
                    {(summary?.totalTokens || 0).toLocaleString()}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Custo est.: ${summary?.estimatedCost.toFixed(4)}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        
        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Latency Over Time */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Latência ao Longo do Tempo
              </CardTitle>
              <CardDescription>Média de latência por período</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-[250px] w-full" />
              ) : latencyOverTime.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={latencyOverTime}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="time" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                      formatter={(value: number) => [`${value}ms`, 'Latência']}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="avgLatency" 
                      stroke="hsl(var(--primary))" 
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                  Sem dados para o período selecionado
                </div>
              )}
            </CardContent>
          </Card>
          
          {/* Calls by Function */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Chamadas por Função
              </CardTitle>
              <CardDescription>Distribuição de uso por Edge Function</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-[250px] w-full" />
              ) : byFunction.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={byFunction.slice(0, 8)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" className="text-xs" />
                    <YAxis type="category" dataKey="name" width={120} className="text-xs" />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                    />
                    <Bar dataKey="calls" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                  Sem dados para o período selecionado
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        
        {/* CVE Database Status */}
        <CVEDatabaseStatus />
        
        {/* Model Distribution & Errors */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Model Distribution */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Distribuição por Modelo
              </CardTitle>
              <CardDescription>Tokens consumidos por modelo de IA</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-[250px] w-full" />
              ) : byModel.length > 0 ? (
                <div className="flex items-center justify-center">
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie
                        data={byModel}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={2}
                        dataKey="tokens"
                        nameKey="name"
                        label={({ name, percent }) => `${name.split('/').pop()} (${(percent * 100).toFixed(0)}%)`}
                        labelLine={false}
                      >
                        {byModel.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                        }}
                        formatter={(value: number) => [value.toLocaleString(), 'Tokens']}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                  Sem dados para o período selecionado
                </div>
              )}
            </CardContent>
          </Card>
          
          {/* Recent Errors */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <XCircle className="h-5 w-5 text-destructive" />
                Erros Recentes
              </CardTitle>
              <CardDescription>Últimas falhas de inferência</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : recentErrors.length > 0 ? (
                <div className="space-y-2 max-h-[250px] overflow-y-auto">
                  {recentErrors.map((error) => (
                    <div 
                      key={error.id} 
                      className="p-3 rounded-lg border bg-destructive/5 border-destructive/20"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">{error.function_name}</span>
                        <span className="text-xs text-muted-foreground">
                          {formatBrazilTime(error.created_at)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 truncate">
                        {error.error || 'Erro desconhecido'}
                      </p>
                      <div className="flex gap-2 mt-1">
                        <Badge variant="outline" className="text-xs">
                          {error.model.split('/').pop()}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {error.latency_ms}ms
                        </Badge>
                        {error.used_fallback && (
                          <Badge variant="secondary" className="text-xs">Fallback</Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                  Nenhum erro no período selecionado 🎉
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminPageLayout>
  );
}
