import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, Brain } from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { format } from '@/lib/date-utils';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';

type Period = '7d' | '30d' | '90d';

export function AIInsightsTrendChart() {
  const { tenant } = useTenant();
  const [period, setPeriod] = useState<Period>('30d');

  const daysMap: Record<Period, number> = { '7d': 7, '30d': 30, '90d': 90 };

  const { data: trendData, isLoading } = useQuery({
    queryKey: ['ai-insights-trend', tenant?.id, period],
    queryFn: async () => {
      if (!tenant?.id) return [];

      const days = daysMap[period];
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      const { data, error } = await supabase
        .from('ai_insights')
        .select('created_at, severity, insight_type, auto_action_executed')
        .eq('tenant_id', tenant.id)
        .gte('created_at', since)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data || [];
    },
    enabled: !!tenant?.id,
    refetchInterval: 300_000,
    refetchIntervalInBackground: false,
  });

  const chartData = useMemo(() => {
    if (!trendData || trendData.length === 0) return [];

    // Group by day
    const grouped: Record<string, {
      date: string;
      total: number;
      critical: number;
      warning: number;
      info: number;
      autoExecuted: number;
    }> = {};

    for (const insight of trendData) {
      const day = format(new Date(insight.created_at), 'yyyy-MM-dd');
      if (!grouped[day]) {
        grouped[day] = { date: day, total: 0, critical: 0, warning: 0, info: 0, autoExecuted: 0 };
      }
      grouped[day].total++;
      if (insight.severity === 'critical') grouped[day].critical++;
      else if (insight.severity === 'warning') grouped[day].warning++;
      else grouped[day].info++;
      if (insight.auto_action_executed) grouped[day].autoExecuted++;
    }

    return Object.values(grouped).sort((a, b) => a.date.localeCompare(b.date));
  }, [trendData]);

  const stats = useMemo(() => {
    if (!trendData) return { total: 0, critical: 0, autoRate: 0 };
    const total = trendData.length;
    const critical = trendData.filter(i => i.severity === 'critical').length;
    const autoExecuted = trendData.filter(i => i.auto_action_executed).length;
    return {
      total,
      critical,
      autoRate: total > 0 ? Math.round((autoExecuted / total) * 100) : 0,
    };
  }, [trendData]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Brain className="h-4 w-4 text-muted-foreground" />
            Tendências de IA
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px]" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Brain className="h-4 w-4 text-primary" />
              Tendências de Insights de IA
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              {stats.total} insights · {stats.critical} críticos · {stats.autoRate}% auto-executados
            </CardDescription>
          </div>
          <div className="flex gap-1">
            {(['7d', '30d', '90d'] as Period[]).map((p) => (
              <Button
                key={p}
                variant={period === p ? 'default' : 'ghost'}
                size="sm"
                className="h-7 text-xs px-2"
                onClick={() => setPeriod(p)}
              >
                {p}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <TrendingUp className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">Sem dados suficientes para o período</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
              <defs>
                <linearGradient id="colorCritical" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(0, 84%, 60%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(0, 84%, 60%)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorWarning" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(38, 92%, 50%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(38, 92%, 50%)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorInfo" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorAuto" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10 }}
                tickFormatter={(v) => format(new Date(v), 'dd/MM')}
                className="text-muted-foreground"
              />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
                labelFormatter={(v) => format(new Date(v), 'dd/MM/yyyy')}
              />
              <Legend iconSize={8} wrapperStyle={{ fontSize: '11px' }} />
              <Area
                type="monotone"
                dataKey="critical"
                name="Críticos"
                stroke="hsl(0, 84%, 60%)"
                fill="url(#colorCritical)"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="warning"
                name="Avisos"
                stroke="hsl(38, 92%, 50%)"
                fill="url(#colorWarning)"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="info"
                name="Info"
                stroke="hsl(217, 91%, 60%)"
                fill="url(#colorInfo)"
                strokeWidth={1.5}
              />
              <Area
                type="monotone"
                dataKey="autoExecuted"
                name="Auto-executados"
                stroke="hsl(142, 71%, 45%)"
                fill="url(#colorAuto)"
                strokeWidth={1.5}
                strokeDasharray="4 2"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
