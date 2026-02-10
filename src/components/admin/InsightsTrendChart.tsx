import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from 'recharts';
import { format, ptBR } from '@/lib/date-utils';
import { subDays, startOfDay } from 'date-fns';

interface TrendData {
  label: string;
  date: string;
  count: number;
  critical: number;
  warning: number;
  info: number;
}

export function InsightsTrendChart() {
  const { tenant } = useTenant();

  const { data: trendData, isLoading } = useQuery({
    queryKey: ['insights-trend', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];

      const days = 7;
      const result: TrendData[] = [];

      // Get insights from last 7 days
      const { data: insights } = await supabase
        .from('ai_insights')
        .select('id, severity, created_at')
        .eq('tenant_id', tenant.id)
        .gte('created_at', subDays(new Date(), days).toISOString());

      // Build daily data
      for (let i = days - 1; i >= 0; i--) {
        const date = startOfDay(subDays(new Date(), i));
        const dateStr = format(date, 'yyyy-MM-dd');
        const dayLabel = format(date, 'EEE', { locale: ptBR });

        const dayInsights = insights?.filter(insight => {
          const insightDate = format(startOfDay(new Date(insight.created_at)), 'yyyy-MM-dd');
          return insightDate === dateStr;
        }) || [];

        result.push({
          label: dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1),
          date: dateStr,
          count: dayInsights.length,
          critical: dayInsights.filter(i => i.severity === 'critical').length,
          warning: dayInsights.filter(i => i.severity === 'warning').length,
          info: dayInsights.filter(i => i.severity === 'info').length,
        });
      }

      return result;
    },
    enabled: !!tenant?.id,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  const data = trendData || [];
  const currentCount = data.length > 0 ? data[data.length - 1].count : 0;
  const previousCount = data.length > 1 ? data[data.length - 2].count : currentCount;
  const trend = currentCount < previousCount ? 'up' : currentCount > previousCount ? 'down' : 'stable';

  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  const trendColor = trend === 'up' ? 'text-green-500' : trend === 'down' ? 'text-red-500' : 'text-muted-foreground';
  const trendLabel = trend === 'up' ? 'Menos avisos' : trend === 'down' ? 'Mais avisos' : 'Estável';

  const getBarColor = (entry: TrendData) => {
    if (entry.critical > 0) return 'hsl(0, 84%, 60%)';
    if (entry.warning > 0) return 'hsl(45, 93%, 47%)';
    return 'hsl(142, 76%, 36%)';
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Avisos por Dia (7 dias)
          </CardTitle>
          <div className={cn("flex items-center gap-1 text-sm", trendColor)}>
            <TrendIcon className="h-4 w-4" />
            <span>{trendLabel}</span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-32">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <XAxis 
                dataKey="label" 
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              />
              <YAxis 
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '12px'
                }}
                formatter={(value: number) => [value, 'Avisos']}
                labelFormatter={(label) => `${label}`}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={getBarColor(entry)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
