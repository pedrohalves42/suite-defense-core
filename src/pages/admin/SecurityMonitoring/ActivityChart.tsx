import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from 'recharts';
import { TrendingUp, ShieldCheck } from 'lucide-react';
import type { ChartDataPoint } from './types';

interface ActivityChartProps {
  chartData: ChartDataPoint[];
  totalEvents: number;
}

export function ActivityChart({ chartData, totalEvents }: ActivityChartProps) {
  const hasData = chartData.some(d => d.eventos > 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            Atividade no Período
          </CardTitle>
          <span className="text-[10px] text-muted-foreground">
            {totalEvents} evento{totalEvents !== 1 ? 's' : ''} detectado{totalEvents !== 1 ? 's' : ''}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        {hasData ? (
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="gradEventos" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="gradCriticos" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--destructive))" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="hsl(var(--destructive))" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
              <XAxis
                dataKey="label"
                className="text-[10px]"
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                interval="preserveStartEnd"
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                className="text-[10px]"
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                width={30}
                tickLine={false}
                axisLine={false}
              />
              <RechartsTooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
              />
              <Legend wrapperStyle={{ fontSize: '11px' }} />
              <Area type="monotone" dataKey="eventos" stroke="hsl(var(--primary))" fill="url(#gradEventos)" name="Eventos" strokeWidth={2} />
              <Area type="monotone" dataKey="criticos" stroke="hsl(var(--destructive))" fill="url(#gradCriticos)" name="Críticos" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex flex-col items-center justify-center h-[180px] text-muted-foreground">
            <ShieldCheck className="h-8 w-8 mb-2 opacity-30" />
            <p className="text-xs">Sem atividade no período</p>
            <p className="text-[10px] mt-1 opacity-60">Isso é bom — nenhuma ameaça detectada</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
