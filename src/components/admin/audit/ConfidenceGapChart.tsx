import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Minus, AlertCircle, Activity, ArrowUp, ArrowDown, ArrowRight } from 'lucide-react';
import { 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  ReferenceLine,
  Area,
  ComposedChart,
  Line
} from 'recharts';
import { format, ptBR } from '@/lib/date-utils';
import { 
  ConfidenceGap, 
  ConfidenceGapTrend,
  getHealthStatusColor,
  getHealthStatusBg,
  getHealthStatusLabel
} from '@/hooks/useConfidenceGap';

interface ConfidenceGapChartProps {
  latestGap: ConfidenceGap | null;
  trendData: ConfidenceGapTrend[];
}

export function ConfidenceGapChart({ latestGap, trendData }: ConfidenceGapChartProps) {
  // Helper to derive trend direction from is_improving flag
  const getTrendDirectionFromData = (item: ConfidenceGapTrend): string => {
    if (item.is_improving) return 'improving';
    if (item.gap_delta && item.gap_delta < 0) return 'degrading';
    return 'stable';
  };

  const chartData = trendData
    .slice()
    .reverse()
    .map(item => ({
      date: format(new Date(item.created_at), 'dd/MM', { locale: ptBR }),
      fullDate: format(new Date(item.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR }),
      anaScore: item.ana_score,
      redScore: item.red_score,
      gap: item.confidence_gap,
      health: item.health_status,
      avg90d: item.avg_gap_90d,
      trendDirection: getTrendDirectionFromData(item),
    }));

  // Get latest trend data for 90d metrics
  const latestTrend = trendData[0];
  const latestTrendDirection = latestTrend ? getTrendDirectionFromData(latestTrend) : null;

  const getTrendIcon = () => {
    if (!latestGap?.gap_delta) return <Minus className="h-4 w-4" />;
    if (latestGap.gap_delta > 0) return <TrendingUp className="h-4 w-4 text-green-500" />;
    if (latestGap.gap_delta < 0) return <TrendingDown className="h-4 w-4 text-red-500" />;
    return <Minus className="h-4 w-4" />;
  };

  const getTrendDirectionIcon = (direction: string | undefined | null) => {
    switch (direction) {
      case 'improving': return <ArrowUp className="h-4 w-4 text-green-500" />;
      case 'degrading': return <ArrowDown className="h-4 w-4 text-red-500" />;
      case 'stable': return <ArrowRight className="h-4 w-4 text-yellow-500" />;
      default: return <Minus className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getTrendDirectionLabel = (direction: string | undefined | null): string => {
    switch (direction) {
      case 'improving': return 'Melhorando';
      case 'degrading': return 'Degradando';
      case 'stable': return 'Estável';
      default: return 'N/A';
    }
  };

  const getTrendDirectionColor = (direction: string | undefined | null): string => {
    switch (direction) {
      case 'improving': return 'text-green-500';
      case 'degrading': return 'text-red-500';
      case 'stable': return 'text-yellow-500';
      default: return 'text-muted-foreground';
    }
  };

  if (!latestGap && trendData.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Activity className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground text-center">
            Nenhum dado de Confidence Gap disponível.
            <br />
            Execute auditorias Ana e Red Team para gerar dados.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Current Status Card */}
      {latestGap && (
        <Card className={`${getHealthStatusBg(latestGap.health_status)} border`}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Confidence Gap Atual</CardTitle>
              <Badge 
                variant="outline" 
                className={getHealthStatusColor(latestGap.health_status)}
              >
                {getHealthStatusLabel(latestGap.health_status)}
              </Badge>
            </div>
            <CardDescription>
              Ana Score - Red Score = Margem de Confiança
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-500">
                  {latestGap.ana_score}
                </div>
                <div className="text-xs text-muted-foreground">Ana Score</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-500">
                  {latestGap.red_score}
                </div>
                <div className="text-xs text-muted-foreground">Red Score</div>
              </div>
              <div className="text-center">
                <div className={`text-2xl font-bold ${getHealthStatusColor(latestGap.health_status)}`}>
                  {latestGap.confidence_gap}
                </div>
                <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                  Gap {getTrendIcon()}
                  {latestGap.gap_delta !== null && (
                    <span className={latestGap.gap_delta >= 0 ? 'text-green-500' : 'text-red-500'}>
                      {latestGap.gap_delta > 0 ? '+' : ''}{latestGap.gap_delta}
                    </span>
                  )}
                </div>
              </div>
              {/* 90d Trend */}
              <div className="text-center border-l">
                <div className="flex items-center justify-center gap-1">
                  {getTrendDirectionIcon(latestTrendDirection)}
                  <span className={`text-lg font-bold ${getTrendDirectionColor(latestTrendDirection)}`}>
                    {latestTrend?.avg_gap_90d?.toFixed(0) || 'N/A'}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  Média 90d ({getTrendDirectionLabel(latestTrendDirection)})
                </div>
              </div>
            </div>

            {latestGap.alert_triggered && (
              <div className="mt-4 p-3 bg-destructive/10 rounded-lg flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <div className="text-sm">
                  <span className="font-medium text-destructive">Alerta: </span>
                  {latestGap.alert_reason}
                </div>
              </div>
            )}

            {/* Gap decreasing warning - derived from is_improving being false with negative gap_delta */}
            {latestTrend && !latestTrend.is_improving && latestTrend.gap_delta && latestTrend.gap_delta < -5 && (
              <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg flex items-start gap-2">
                <TrendingDown className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <span className="font-medium text-yellow-500">Atenção: </span>
                  Gap em queda significativa (delta: {latestTrend.gap_delta}).
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Trend Chart */}
      {chartData.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Evolução do Confidence Gap
            </CardTitle>
            <CardDescription>
              Histórico de 30 dias — Linha tracejada = média 90d
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="date" 
                    className="text-xs"
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <YAxis 
                    domain={[0, 100]}
                    className="text-xs"
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
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
                        anaScore: 'Ana Score',
                        redScore: 'Red Score',
                        gap: 'Confidence Gap',
                        avg90d: 'Média 90d',
                      };
                      return [value?.toFixed?.(0) ?? value, labels[name] || name];
                    }}
                    labelFormatter={(label) => `Data: ${label}`}
                  />
                  
                  {/* Reference lines for health zones */}
                  <ReferenceLine y={40} stroke="hsl(var(--primary))" strokeDasharray="5 5" />
                  <ReferenceLine y={20} stroke="hsl(var(--destructive))" strokeDasharray="5 5" />
                  
                  <Line 
                    type="monotone" 
                    dataKey="anaScore" 
                    stroke="hsl(142, 76%, 36%)" 
                    strokeWidth={2}
                    dot={{ fill: 'hsl(142, 76%, 36%)', r: 3 }}
                    name="anaScore"
                  />
                  <Line 
                    type="monotone" 
                    dataKey="redScore" 
                    stroke="hsl(0, 84%, 60%)" 
                    strokeWidth={2}
                    dot={{ fill: 'hsl(0, 84%, 60%)', r: 3 }}
                    name="redScore"
                  />
                  <Area
                    type="monotone"
                    dataKey="gap"
                    fill="hsl(var(--primary) / 0.1)"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    name="gap"
                  />
                  {/* 90d average line */}
                  <Line 
                    type="monotone" 
                    dataKey="avg90d" 
                    stroke="hsl(var(--muted-foreground))"
                    strokeWidth={2}
                    strokeDasharray="8 4"
                    dot={false}
                    name="avg90d"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            
            <div className="flex justify-center gap-6 mt-4 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <span className="text-muted-foreground">Ana Score</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <span className="text-muted-foreground">Red Score</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-primary" />
                <span className="text-muted-foreground">Gap</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-0.5 bg-muted-foreground" style={{ backgroundImage: 'repeating-linear-gradient(90deg, currentColor 0, currentColor 8px, transparent 8px, transparent 12px)' }} />
                <span className="text-muted-foreground">Média 90d</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Health Zones Legend */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Zonas de Saúde</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
              <div className="font-medium text-green-500">Saudável</div>
              <div className="text-sm text-muted-foreground">Gap {'>'} 40</div>
              <div className="text-xs text-muted-foreground mt-1">
                Sistema bem protegido
              </div>
            </div>
            <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
              <div className="font-medium text-yellow-500">Atenção</div>
              <div className="text-sm text-muted-foreground">Gap 20-40</div>
              <div className="text-xs text-muted-foreground mt-1">
                Margem reduzida
              </div>
            </div>
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <div className="font-medium text-red-500">Crítico</div>
              <div className="text-sm text-muted-foreground">Gap {'<'} 20</div>
              <div className="text-xs text-muted-foreground mt-1">
                Risco elevado
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
