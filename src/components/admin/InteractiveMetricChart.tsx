import { useState, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, 
  Tooltip as RechartsTooltip, ResponsiveContainer, Legend,
  BarChart, Bar
} from 'recharts';
import { Download, TrendingUp, TrendingDown, Minus, BarChart3, AreaChartIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

export interface MetricDataPoint {
  date: string;
  label: string;
  [key: string]: string | number;
}

interface MetricSeries {
  key: string;
  label: string;
  color: string;
}

interface InteractiveMetricChartProps {
  title: string;
  description?: string;
  data: MetricDataPoint[];
  previousData?: MetricDataPoint[];
  series: MetricSeries[];
  timeRanges?: { label: string; days: number }[];
  onTimeRangeChange?: (days: number) => void;
  selectedRange?: number;
  className?: string;
}

function calculateTrend(data: MetricDataPoint[], key: string): { direction: 'up' | 'down' | 'flat'; percent: number } {
  if (data.length < 2) return { direction: 'flat', percent: 0 };
  
  const recent = data.slice(-3);
  const older = data.slice(0, 3);
  
  const recentAvg = recent.reduce((sum, d) => sum + (Number(d[key]) || 0), 0) / recent.length;
  const olderAvg = older.reduce((sum, d) => sum + (Number(d[key]) || 0), 0) / older.length;
  
  if (olderAvg === 0) return { direction: recentAvg > 0 ? 'up' : 'flat', percent: 0 };
  
  const change = ((recentAvg - olderAvg) / olderAvg) * 100;
  return {
    direction: Math.abs(change) < 2 ? 'flat' : change > 0 ? 'up' : 'down',
    percent: Math.abs(Math.round(change))
  };
}

export function InteractiveMetricChart({
  title,
  description,
  data,
  previousData,
  series,
  timeRanges = [
    { label: '7d', days: 7 },
    { label: '14d', days: 14 },
    { label: '30d', days: 30 },
  ],
  onTimeRangeChange,
  selectedRange = 7,
  className,
}: InteractiveMetricChartProps) {
  const [chartType, setChartType] = useState<'area' | 'bar'>('area');
  const [showComparison, setShowComparison] = useState(false);

  const trend = useMemo(() => calculateTrend(data, series[0]?.key || ''), [data, series]);

  const TrendIcon = trend.direction === 'up' ? TrendingUp : trend.direction === 'down' ? TrendingDown : Minus;
  const trendColor = trend.direction === 'up' ? 'text-success' : trend.direction === 'down' ? 'text-destructive' : 'text-muted-foreground';

  const handleExportCSV = useCallback(() => {
    if (!data.length) return;
    const headers = ['date', ...series.map(s => s.key)];
    const csv = [
      headers.join(','),
      ...data.map(row => headers.map(h => row[h] ?? '').join(','))
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [data, series, title]);

  const displayData = useMemo(() => {
    if (!showComparison || !previousData) return data;
    return data.map((point, i) => ({
      ...point,
      ...series.reduce((acc, s) => {
        acc[`prev_${s.key}`] = Number(previousData[i]?.[s.key] ?? 0);
        return acc;
      }, {} as Record<string, string | number>)
    }));
  }, [data, previousData, showComparison, series]);

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm">{title}</CardTitle>
            <Badge variant="outline" className={cn("text-[10px] gap-0.5", trendColor)}>
              <TrendIcon className="h-3 w-3" />
              {trend.percent}%
            </Badge>
          </div>
          <div className="flex items-center gap-1">
            {/* Time range selector */}
            <div className="flex bg-muted/50 rounded-md p-0.5">
              {timeRanges.map(range => (
                <Button
                  key={range.days}
                  size="sm"
                  variant={selectedRange === range.days ? "secondary" : "ghost"}
                  className="h-6 text-[10px] px-2"
                  onClick={() => onTimeRangeChange?.(range.days)}
                >
                  {range.label}
                </Button>
              ))}
            </div>

            {/* Chart type toggle */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0"
                  onClick={() => setChartType(t => t === 'area' ? 'bar' : 'area')}
                >
                  {chartType === 'area' ? <BarChart3 className="h-3 w-3" /> : <AreaChartIcon className="h-3 w-3" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Alternar tipo de gráfico</TooltipContent>
            </Tooltip>

            {/* Comparison toggle */}
            {previousData && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant={showComparison ? "secondary" : "ghost"}
                    className="h-6 text-[10px] px-2"
                    onClick={() => setShowComparison(v => !v)}
                  >
                    vs anterior
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Comparar com período anterior</TooltipContent>
              </Tooltip>
            )}

            {/* Export */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={handleExportCSV}>
                  <Download className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Exportar CSV</TooltipContent>
            </Tooltip>
          </div>
        </div>
        {description && <p className="text-[11px] text-muted-foreground">{description}</p>}
      </CardHeader>
      <CardContent className="pb-3">
        <AnimatePresence mode="wait">
          <motion.div
            key={chartType}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <ResponsiveContainer width="100%" height={200}>
              {chartType === 'area' ? (
                <AreaChart data={displayData} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
                  <defs>
                    {series.map(s => (
                      <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={s.color} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={s.color} stopOpacity={0} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} className="text-muted-foreground" />
                  <YAxis tick={{ fontSize: 10 }} className="text-muted-foreground" />
                  <RechartsTooltip
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      fontSize: '11px'
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '10px' }} />
                  {series.map(s => (
                    <Area
                      key={s.key}
                      type="monotone"
                      dataKey={s.key}
                      name={s.label}
                      stroke={s.color}
                      fill={`url(#grad-${s.key})`}
                      strokeWidth={2}
                    />
                  ))}
                  {showComparison && series.map(s => (
                    <Area
                      key={`prev_${s.key}`}
                      type="monotone"
                      dataKey={`prev_${s.key}`}
                      name={`${s.label} (anterior)`}
                      stroke={s.color}
                      fill="none"
                      strokeWidth={1}
                      strokeDasharray="4 4"
                      opacity={0.5}
                    />
                  ))}
                </AreaChart>
              ) : (
                <BarChart data={displayData} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <RechartsTooltip
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      fontSize: '11px'
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '10px' }} />
                  {series.map(s => (
                    <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={[3, 3, 0, 0]} />
                  ))}
                </BarChart>
              )}
            </ResponsiveContainer>
          </motion.div>
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}
