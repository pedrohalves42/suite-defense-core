import { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { JobHourlyTrend } from '@/hooks/useJobsHealth';
import { formatBrazilTime } from '@/lib/date-utils';

interface JobsTrendChartProps {
  trends: JobHourlyTrend[];
  isLoading?: boolean;
}

export function JobsTrendChart({ trends, isLoading }: JobsTrendChartProps) {
  const chartData = useMemo(() => {
    return trends.map(t => ({
      hour: formatBrazilTime(t.hour),
      completed: t.completed,
      failed: t.failed,
      total: t.total,
      successRate: t.success_rate_pct || 0,
    }));
  }, [trends]);

  if (isLoading) {
    return <Skeleton className="h-[300px] w-full" />;
  }

  if (!chartData.length) {
    return (
      <div className="h-[300px] flex items-center justify-center text-muted-foreground">
        Sem dados de tendência nas últimas 24 horas
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="colorCompleted" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.8}/>
            <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0.1}/>
          </linearGradient>
          <linearGradient id="colorFailed" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(var(--destructive))" stopOpacity={0.8}/>
            <stop offset="95%" stopColor="hsl(var(--destructive))" stopOpacity={0.1}/>
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis 
          dataKey="hour" 
          tick={{ fontSize: 12 }}
          className="text-muted-foreground"
        />
        <YAxis 
          tick={{ fontSize: 12 }}
          className="text-muted-foreground"
        />
        <Tooltip 
          contentStyle={{ 
            backgroundColor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '8px',
          }}
          labelStyle={{ color: 'hsl(var(--foreground))' }}
          formatter={(value: number, name: string) => {
            const labels: Record<string, string> = {
              completed: 'Concluídos',
              failed: 'Falhas',
              total: 'Total',
            };
            return [value, labels[name] || name];
          }}
        />
        <Legend 
          formatter={(value) => {
            const labels: Record<string, string> = {
              completed: 'Concluídos',
              failed: 'Falhas',
            };
            return labels[value] || value;
          }}
        />
        <Area
          type="monotone"
          dataKey="completed"
          stroke="hsl(var(--chart-2))"
          fillOpacity={1}
          fill="url(#colorCompleted)"
          strokeWidth={2}
        />
        <Area
          type="monotone"
          dataKey="failed"
          stroke="hsl(var(--destructive))"
          fillOpacity={1}
          fill="url(#colorFailed)"
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
