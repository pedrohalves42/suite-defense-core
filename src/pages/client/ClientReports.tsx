import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  FileText, 
  Download,
  Calendar,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle
} from 'lucide-react';
import { formatBrazilDateTime } from '@/lib/date-utils';
import { motion } from 'framer-motion';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';

export const ClientReports = () => {
  const { tenant } = useTenant();

  const { data: reports, isLoading } = useQuery({
    queryKey: ['client-reports', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];

      const { data, error } = await supabase
        .from('generated_reports')
        .select('id, tenant_id, report_type, risk_level, risk_score, created_at, expires_at, file_url, agent_name, commercial_priority')
        .eq('tenant_id', tenant.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return data || [];
    },
    enabled: !!tenant?.id
  });

  // Prepare chart data (last 30 days of risk scores)
  const chartData = reports?.slice(0, 30).reverse().map((report, index: number) => ({
    name: formatBrazilDateTime(report.created_at, 'day-month'),
    score: report.risk_score || 0
  })) || [];

  // Calculate trend
  const getTrend = () => {
    if (!reports || reports.length < 2) return null;
    const recent = reports.slice(0, 5);
    const older = reports.slice(5, 10);
    
    if (older.length === 0) return null;
    
    const recentAvg = recent.reduce((sum, r) => sum + (r.risk_score || 0), 0) / recent.length;
    const olderAvg = older.reduce((sum, r) => sum + (r.risk_score || 0), 0) / older.length;
    
    const diff = recentAvg - olderAvg;
    
    if (diff < -5) return { direction: 'down', label: 'Melhorando', color: 'text-green-500', icon: TrendingDown };
    if (diff > 5) return { direction: 'up', label: 'Piorando', color: 'text-red-500', icon: TrendingUp };
    return { direction: 'stable', label: 'Estável', color: 'text-muted-foreground', icon: Minus };
  };

  const trend = getTrend();

  const getRiskBadge = (score: number | null) => {
    if (score === null) return null;
    if (score >= 60) return <Badge variant="destructive">Alto Risco</Badge>;
    if (score >= 30) return <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-600">Risco Médio</Badge>;
    return <Badge variant="default" className="bg-green-500/10 text-green-600">Baixo Risco</Badge>;
  };

  const isCritical = (score: number | null) => score !== null && score >= 60;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Meus Relatórios</h1>
        <p className="text-muted-foreground">
          Relatórios de segurança dos seus computadores
        </p>
      </div>

      {/* Evolution Chart */}
      {chartData.length > 1 ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Evolução do Risco</CardTitle>
              {trend && (
                <div className={`flex items-center gap-2 ${trend.color}`}>
                  <trend.icon className="h-4 w-4" />
                  <span className="text-sm font-medium">{trend.label}</span>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="riskGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis 
                    dataKey="name" 
                    tick={{ fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis 
                    domain={[0, 100]} 
                    tick={{ fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      background: 'hsl(var(--background))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                    formatter={(value: number) => [`${value} pontos`, 'Risco']}
                  />
                  <Area
                    type="monotone"
                    dataKey="score"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    fill="url(#riskGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-muted-foreground text-center mt-2">
              Quanto menor o score, melhor a segurança
            </p>
          </CardContent>
        </Card>
      ) : reports && reports.length > 0 && (
        <Card className="bg-muted/30">
          <CardContent className="flex flex-col items-center justify-center py-8">
            <TrendingUp className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground text-center">
              📊 O gráfico de evolução aparecerá após o segundo relatório
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Continue monitorando para acompanhar a tendência
            </p>
          </CardContent>
        </Card>
      )}

      {reports && reports.length > 0 ? (
        <div className="space-y-4">
          {reports.map((report: any, index: number) => (
            <motion.div
              key={report.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <Card className={isCritical(report.risk_score) ? 'border-red-500/50 animate-pulse' : ''}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg ${isCritical(report.risk_score) ? 'bg-red-500/10' : 'bg-primary/10'}`}>
                        {isCritical(report.risk_score) ? (
                          <AlertTriangle className="h-5 w-5 text-red-500" />
                        ) : (
                          <FileText className="h-5 w-5 text-primary" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium">{report.title}</h3>
                          {isCritical(report.risk_score) && (
                            <Badge variant="destructive" className="text-xs">
                              URGENTE
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          {formatBrazilDateTime(report.created_at)}
                        </div>
                        {report.agent_name && (
                          <p className="text-sm text-muted-foreground mt-1">
                            Computador: {report.agent_name}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {getRiskBadge(report.risk_score)}
                      {report.file_url && (
                        <Button 
                          variant="outline" 
                          size="sm"
                          asChild
                        >
                          <a href={report.file_url} target="_blank" rel="noopener noreferrer">
                            <Download className="h-4 w-4 mr-2" />
                            Baixar
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Nenhum relatório ainda</h3>
            <p className="text-muted-foreground text-center max-w-md">
              Relatórios de segurança serão gerados automaticamente após as análises dos seus computadores.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
