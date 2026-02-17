import { formatBrazilDateTime } from '@/lib/date-utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useInstallationTrend } from '@/hooks/useInstallationTrend';
import { TrendingUp, Loader2 } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

export function InstallationTrendChart() {
  const { data: trendData, isLoading } = useInstallationTrend(7);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Tendência de Instalações (7 dias)
          </CardTitle>
        </CardHeader>
        <CardContent className="h-[300px] flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const chartData = (trendData || []).map(item => ({
    ...item,
    date: formatBrazilDateTime(item.date, 'day-month')
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Tendência de Instalações (7 dias)
        </CardTitle>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 || chartData.every(d => d.total === 0) ? (
          <div className="h-[300px] flex items-center justify-center text-muted-foreground">
            Sem dados de instalação nos últimos 7 dias
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey="date" 
                className="text-xs"
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
              />
              <YAxis 
                yAxisId="left"
                className="text-xs"
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
              />
              <YAxis 
                yAxisId="right" 
                orientation="right"
                domain={[0, 100]}
                className="text-xs"
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--card))', 
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px'
                }}
                labelStyle={{ color: 'hsl(var(--foreground))' }}
              />
              <Legend />
              <Line 
                yAxisId="left"
                type="monotone" 
                dataKey="total" 
                name="Total"
                stroke="hsl(var(--primary))" 
                strokeWidth={2}
                dot={{ fill: 'hsl(var(--primary))' }}
              />
              <Line 
                yAxisId="left"
                type="monotone" 
                dataKey="successful" 
                name="Sucesso"
                stroke="hsl(142.1, 76.2%, 36.3%)" 
                strokeWidth={2}
                dot={{ fill: 'hsl(142.1, 76.2%, 36.3%)' }}
              />
              <Line 
                yAxisId="right"
                type="monotone" 
                dataKey="successRate" 
                name="Taxa (%)"
                stroke="hsl(47.9, 95.8%, 53.1%)" 
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={{ fill: 'hsl(47.9, 95.8%, 53.1%)' }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
