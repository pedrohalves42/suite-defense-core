import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Shield, RefreshCw, ArrowLeft, ShieldAlert, Bug, WifiOff, 
  AlertTriangle, Activity, TrendingUp, TrendingDown, Minus 
} from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useRiskScore, RiskBreakdown } from '@/hooks/useRiskScore';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { format, ptBR } from '@/lib/date-utils';

const BREAKDOWN_CONFIG: Record<keyof RiskBreakdown, { 
  icon: typeof Shield; label: string; description: string; link: string;
}> = {
  antivirus_issues: { icon: ShieldAlert, label: 'Antivírus', description: 'Computadores com antivírus desativado ou desatualizado', link: '/admin/antivirus-status' },
  critical_vulnerabilities: { icon: Bug, label: 'Vulnerabilidades', description: 'Vulnerabilidades críticas encontradas no sistema', link: '/admin/vulnerabilities' },
  offline_agents: { icon: WifiOff, label: 'Computadores Offline', description: 'Computadores que não estão respondendo', link: '/admin/agent-health' },
  critical_events: { icon: AlertTriangle, label: 'Eventos Críticos', description: 'Eventos de segurança nas últimas 24 horas', link: '/admin/security-monitoring' },
  job_failure_rate: { icon: Activity, label: 'Taxa de Falhas', description: 'Alta taxa de falha em tarefas do sistema', link: '/admin/jobs-health' },
};

export default function RiskScore() {
  const { riskScore, history, isLoading, recalculate, isRecalculating, getScoreColor, getScoreStatus, getTrendInfo } = useRiskScore();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4"><Skeleton className="h-8 w-8" /><Skeleton className="h-8 w-48" /></div>
        <Skeleton className="h-64 w-full" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4"><Skeleton className="h-32" /><Skeleton className="h-32" /></div>
      </div>
    );
  }

  const score = riskScore?.score ?? 100;
  const status = getScoreStatus(score);
  const trendInfo = getTrendInfo(riskScore?.trend ?? null);
  const breakdown = riskScore?.breakdown ?? {};
  const TrendIcon = riskScore?.trend === 'up' ? TrendingUp : riskScore?.trend === 'down' ? TrendingDown : Minus;

  const chartData = history?.map(h => ({
    date: format(new Date(h.calculated_at), 'dd/MM', { locale: ptBR }),
    score: h.score,
  })) ?? [];

  const getComparison = () => {
    if (!history || history.length < 2) return null;
    const now = new Date();
    const currentScore = riskScore?.score ?? 100;
    const weekAgoEntry = history.find(h => new Date(h.calculated_at) <= new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));
    const monthAgoEntry = history.find(h => new Date(h.calculated_at) <= new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000));
    return {
      weekDiff: weekAgoEntry ? currentScore - weekAgoEntry.score : null,
      monthDiff: monthAgoEntry ? currentScore - monthAgoEntry.score : null,
    };
  };
  
  const comparison = getComparison();
  const activeBreakdown = Object.entries(breakdown).filter(([_, value]) => value !== 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/admin"><Button variant="ghost" size="icon"><ArrowLeft className="h-5 w-5" /></Button></Link>
          <div>
            <h1 className="text-xl font-bold text-foreground">Risk Score</h1>
            <p className="text-sm text-muted-foreground">Análise detalhada do nível de risco da sua empresa</p>
          </div>
        </div>
        <Button onClick={() => recalculate()} disabled={isRecalculating} variant="outline">
          <RefreshCw className={cn("h-4 w-4 mr-2", isRecalculating && "animate-spin")} />Recalcular
        </Button>
      </div>

      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <Card className={cn("border-2",
          status.variant === 'success' && "bg-green-500/10 border-green-500/30",
          status.variant === 'warning' && "bg-yellow-500/10 border-yellow-500/30",
          status.variant === 'danger' && "bg-red-500/10 border-red-500/30"
        )}>
          <CardContent className="py-8">
            <div className="flex flex-col md:flex-row items-center justify-center gap-8">
              <div className="relative">
                <svg className="h-40 w-40 -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="10" className="text-muted/20" />
                  <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${score * 2.51} 251`} className={cn(score >= 80 && "text-green-500", score >= 60 && score < 80 && "text-yellow-500", score < 60 && "text-red-500")} />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className={cn("text-4xl font-bold", getScoreColor(score))}>{score}</span>
                  <span className="text-sm text-muted-foreground">/100</span>
                </div>
              </div>
              <div className="text-center md:text-left">
                <div className="flex items-center justify-center md:justify-start gap-3 mb-2">
                  <h2 className={cn("text-2xl font-bold",
                    status.variant === 'success' && "text-green-600 dark:text-green-400",
                    status.variant === 'warning' && "text-yellow-600 dark:text-yellow-400",
                    status.variant === 'danger' && "text-red-600 dark:text-red-400"
                  )}>{status.label}</h2>
                  {riskScore?.trend && (
                    <span className={cn("flex items-center gap-1 text-sm px-2 py-1 rounded-full bg-background/50", trendInfo.color)}>
                      <TrendIcon className="h-4 w-4" />{trendInfo.label}
                    </span>
                  )}
                </div>
                <p className="text-muted-foreground max-w-md">
                  {score >= 80 ? "Sua empresa está bem protegida. Continue monitorando para manter esse nível."
                    : score >= 60 ? "Existem pontos de atenção que precisam ser verificados para melhorar sua proteção."
                    : "Ação urgente necessária. Existem riscos significativos que precisam ser resolvidos."}
                </p>
                {comparison && (comparison.weekDiff !== null || comparison.monthDiff !== null) && (
                  <div className="flex items-center gap-4 mt-3 text-sm">
                    {comparison.weekDiff !== null && (
                      <span className={cn("flex items-center gap-1", comparison.weekDiff > 0 && "text-green-600", comparison.weekDiff < 0 && "text-red-600", comparison.weekDiff === 0 && "text-muted-foreground")}>
                        {comparison.weekDiff > 0 ? <TrendingUp className="h-4 w-4" /> : comparison.weekDiff < 0 ? <TrendingDown className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
                        vs. semana: {comparison.weekDiff > 0 ? '+' : ''}{comparison.weekDiff} pts
                      </span>
                    )}
                    {comparison.monthDiff !== null && (
                      <span className={cn("flex items-center gap-1", comparison.monthDiff > 0 && "text-green-600", comparison.monthDiff < 0 && "text-red-600", comparison.monthDiff === 0 && "text-muted-foreground")}>
                        {comparison.monthDiff > 0 ? <TrendingUp className="h-4 w-4" /> : comparison.monthDiff < 0 ? <TrendingDown className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
                        vs. mês: {comparison.monthDiff > 0 ? '+' : ''}{comparison.monthDiff} pts
                      </span>
                    )}
                  </div>
                )}
                {riskScore?.calculated_at && (
                  <p className="text-xs text-muted-foreground mt-2">Última atualização: {format(new Date(riskScore.calculated_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}>
          <Card>
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-muted-foreground" />O que está afetando seu score</CardTitle></CardHeader>
            <CardContent>
              {activeBreakdown.length === 0 ? (
                <div className="text-center py-6"><Shield className="h-12 w-12 mx-auto text-green-500 mb-3" /><p className="text-green-600 font-medium">Nenhuma penalidade ativa!</p><p className="text-sm text-muted-foreground mt-1">Todos os fatores de segurança estão em ordem.</p></div>
              ) : (
                <div className="space-y-3">
                  {activeBreakdown.map(([key, value]) => {
                    const config = BREAKDOWN_CONFIG[key as keyof RiskBreakdown];
                    if (!config) return null;
                    const Icon = config.icon;
                    return (
                      <Link key={key} to={config.link} className="flex items-center justify-between p-3 rounded-lg bg-red-500/5 hover:bg-red-500/10 border border-red-500/20 transition-colors">
                        <div className="flex items-center gap-3">
                          <Icon className="h-5 w-5 text-red-500" />
                          <div><p className="font-medium text-red-700 dark:text-red-400">{config.label}</p><p className="text-xs text-muted-foreground">{config.description}</p></div>
                        </div>
                        <span className="text-lg font-bold text-red-600">{value}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}>
          <Card>
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Activity className="h-5 w-5 text-muted-foreground" />Histórico (últimos 30 dias)</CardTitle></CardHeader>
            <CardContent>
              {chartData.length < 2 ? (
                <div className="text-center py-6"><Activity className="h-12 w-12 mx-auto text-muted-foreground mb-3" /><p className="text-muted-foreground">Dados insuficientes</p><p className="text-sm text-muted-foreground mt-1">O histórico será exibido após mais cálculos.</p></div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={chartData}>
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                    <Tooltip content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        return (<div className="bg-background border border-border rounded-lg p-2 shadow-lg"><p className="text-sm font-medium">Score: <span className={getScoreColor(payload[0].value as number)}>{payload[0].value}</span></p></div>);
                      }
                      return null;
                    }} />
                    <ReferenceLine y={80} stroke="#22c55e" strokeDasharray="3 3" />
                    <ReferenceLine y={60} stroke="#eab308" strokeDasharray="3 3" />
                    <Line type="monotone" dataKey="score" stroke="#3b82f6" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {activeBreakdown.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card>
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Shield className="h-5 w-5 text-muted-foreground" />Ações Recomendadas</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {activeBreakdown.sort((a, b) => a[1] - b[1]).slice(0, 3).map(([key, value]) => {
                  const config = BREAKDOWN_CONFIG[key as keyof RiskBreakdown];
                  if (!config) return null;
                  return (
                    <Link key={key} to={config.link} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <span className="text-lg">🔧</span>
                        <div><p className="font-medium">Resolver problemas de {config.label.toLowerCase()}</p><p className="text-xs text-muted-foreground">Pode melhorar seu score em até {Math.abs(value)} pontos</p></div>
                      </div>
                      <Button variant="ghost" size="sm">Ver →</Button>
                    </Link>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
