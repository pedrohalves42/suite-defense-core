import { useState, useEffect } from "react";
import { Activity, CheckCircle2, XCircle, Clock, AlertTriangle, RefreshCw, Zap, ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

interface CronHealthRecord {
  id: string;
  cron_name: string;
  last_success_at: string | null;
  last_failure_at: string | null;
  last_error: string | null;
  consecutive_failures: number;
  total_runs: number;
  total_failures: number;
  avg_duration_ms: number | null;
  last_duration_ms: number | null;
  metadata: Record<string, unknown> | null;
  updated_at: string;
}

const CRON_LABELS: Record<string, { label: string; description: string; icon: typeof Activity }> = {
  'maintenance-cron': { label: 'Manutenção', description: 'Limpeza e expiração de jobs', icon: Clock },
  'process-agent-updates': { label: 'Atualizações', description: 'Push de updates para agentes', icon: RefreshCw },
  'process-scheduled-jobs': { label: 'Jobs Agendados', description: 'Processamento de tarefas recorrentes', icon: Zap },
  'invoke-scheduled-jobs': { label: 'Invocação de Jobs', description: 'Disparo de jobs agendados', icon: Activity },
  'cron-sentinel': { label: 'Sentinela', description: 'Monitoramento de falhas silenciosas', icon: AlertTriangle },
};

function getStatusInfo(record: CronHealthRecord) {
  if (record.consecutive_failures >= 5) return { status: 'critical', color: 'text-destructive', bg: 'bg-destructive/10', label: 'Crítico' };
  if (record.consecutive_failures >= 2) return { status: 'warning', color: 'text-warning', bg: 'bg-warning/10', label: 'Atenção' };
  if (!record.last_success_at) return { status: 'unknown', color: 'text-muted-foreground', bg: 'bg-muted', label: 'Sem dados' };

  const lastSuccess = new Date(record.last_success_at);
  const minutesSince = (Date.now() - lastSuccess.getTime()) / 60000;
  if (minutesSince > 60) return { status: 'stale', color: 'text-warning', bg: 'bg-warning/10', label: 'Atrasado' };
  return { status: 'healthy', color: 'text-success', bg: 'bg-success/10', label: 'Saudável' };
}

function formatTimeAgo(dateStr: string | null) {
  if (!dateStr) return '—';
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: ptBR });
  } catch {
    return '—';
  }
}

function formatDuration(ms: number | null) {
  if (ms === null || ms === undefined) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** Mini sparkline-style bar for duration */
function DurationBar({ current, avg }: { current: number | null; avg: number | null }) {
  const max = Math.max(current || 0, avg || 0, 1);
  const currentPct = current ? Math.round((current / max) * 100) : 0;
  const avgPct = avg ? Math.round((avg / max) * 100) : 0;

  return (
    <div className="flex items-end gap-0.5 h-5">
      <div
        className="w-2 rounded-t bg-info/60 transition-all"
        style={{ height: `${avgPct}%`, minHeight: '2px' }}
        title={`Média: ${formatDuration(avg)}`}
      />
      <div
        className={cn(
          "w-2 rounded-t transition-all",
          current && avg && current > avg * 1.5 ? "bg-warning" : "bg-success"
        )}
        style={{ height: `${currentPct}%`, minHeight: '2px' }}
        title={`Última: ${formatDuration(current)}`}
      />
    </div>
  );
}

/** Generate mock execution history for chart (will be replaced with real data when available) */
function generateExecutionHistory(record: CronHealthRecord) {
  const days = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
  const totalPerDay = Math.max(1, Math.round(record.total_runs / 7));
  const failPerDay = Math.max(0, Math.round(record.total_failures / 7));

  return days.map((day, i) => {
    const variation = Math.round((Math.random() - 0.5) * 2);
    const success = Math.max(0, totalPerDay + variation - failPerDay);
    const failures = i === days.length - 1 ? record.consecutive_failures : Math.max(0, failPerDay + Math.round((Math.random() - 0.5)));
    return { day, success, failures };
  });
}

export default function CronHealthDashboard() {
  const [records, setRecords] = useState<CronHealthRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedCron, setExpandedCron] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('cron_health')
      .select('*')
      .order('consecutive_failures', { ascending: false });

    if (error) {
      toast.error('Erro ao carregar saúde dos crons');
    } else {
      setRecords((data || []) as unknown as CronHealthRecord[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, []);

  const healthyCrons = records.filter(r => getStatusInfo(r).status === 'healthy').length;
  const totalCrons = records.length;
  const overallHealth = totalCrons > 0 ? Math.round((healthyCrons / totalCrons) * 100) : 0;
  const totalRuns = records.reduce((s, r) => s + r.total_runs, 0);
  const totalFailures = records.reduce((s, r) => s + r.total_failures, 0);
  const globalSuccessRate = totalRuns > 0 ? Math.round(((totalRuns - totalFailures) / totalRuns) * 100) : 100;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground">Saúde dos Cron Jobs</h1>
          <p className="text-xs md:text-sm text-muted-foreground mt-1">
            Monitoramento em tempo real dos processos agendados
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
          <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
          Atualizar
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { icon: CheckCircle2, value: healthyCrons, label: 'Saudáveis', iconColor: 'text-success', iconBg: 'bg-success/10' },
          { icon: XCircle, value: totalCrons - healthyCrons, label: 'Com problemas', iconColor: 'text-destructive', iconBg: 'bg-destructive/10' },
          { icon: Activity, value: totalRuns, label: 'Total execuções', iconColor: 'text-info', iconBg: 'bg-info/10' },
          { icon: Zap, value: `${globalSuccessRate}%`, label: 'Taxa de sucesso',
            iconColor: globalSuccessRate >= 95 ? 'text-success' : globalSuccessRate >= 80 ? 'text-warning' : 'text-destructive',
            iconBg: globalSuccessRate >= 95 ? 'bg-success/10' : globalSuccessRate >= 80 ? 'bg-warning/10' : 'bg-destructive/10'
          },
        ].map((card, i) => {
          const Icon = card.icon;
          return (
            <motion.div
              key={card.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, duration: 0.3 }}
            >
              <Card>
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center gap-3">
                    <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center shrink-0", card.iconBg)}>
                      <Icon className={cn("h-4 w-4", card.iconColor)} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xl md:text-2xl font-bold text-foreground tabular-nums">{card.value}</p>
                      <p className="text-[11px] text-muted-foreground">{card.label}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Execution Overview Chart */}
      {records.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
        >
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Execuções por Cron (últimos 7 dias)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-44 md:h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={records.map(r => ({
                      name: CRON_LABELS[r.cron_name]?.label || r.cron_name,
                      sucesso: r.total_runs - r.total_failures,
                      falhas: r.total_failures,
                    }))}
                    margin={{ top: 5, right: 5, left: -15, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="name"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                        fontSize: '12px',
                        color: 'hsl(var(--card-foreground))',
                      }}
                    />
                    <Bar dataKey="sucesso" stackId="a" fill="hsl(var(--success))" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="falhas" stackId="a" fill="hsl(var(--destructive))" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Cron List */}
      <div className="space-y-3">
        {loading && records.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
              Carregando...
            </CardContent>
          </Card>
        ) : records.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Activity className="h-8 w-8 mx-auto mb-3 opacity-40" />
              <p className="font-medium">Nenhum cron reportou saúde ainda</p>
              <p className="text-xs mt-1">Os dados aparecerão conforme os crons executarem</p>
            </CardContent>
          </Card>
        ) : (
          records.map((record, idx) => {
            const info = getStatusInfo(record);
            const meta = CRON_LABELS[record.cron_name];
            const Icon = meta?.icon || Activity;
            const successRate = record.total_runs > 0
              ? Math.round(((record.total_runs - record.total_failures) / record.total_runs) * 100)
              : 100;
            const isExpanded = expandedCron === record.id;
            const needsAttention = info.status === 'critical' || info.status === 'stale';

            return (
              <motion.div
                key={record.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.04, duration: 0.3 }}
              >
                <Card className={cn(
                  "transition-colors",
                  info.status === 'critical' && "border-destructive/30",
                  info.status === 'stale' && "border-warning/30"
                )}>
                  <CardContent className="py-4">
                    {/* Main row */}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      {/* Icon + Name */}
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center shrink-0 relative", info.bg)}>
                          <Icon className={cn("h-4 w-4", info.color)} />
                          {/* Pulsating indicator for attention */}
                          {needsAttention && (
                            <span className={cn(
                              "absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full animate-pulse",
                              info.status === 'critical' ? "bg-destructive" : "bg-warning"
                            )} />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-sm text-foreground truncate">
                              {meta?.label || record.cron_name}
                            </p>
                            <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 shrink-0", info.color)}>
                              {info.label}
                            </Badge>
                          </div>
                          <p className="text-[11px] text-muted-foreground truncate">
                            {meta?.description || record.cron_name}
                          </p>
                        </div>
                      </div>

                      {/* Stats row */}
                      <div className="flex items-center gap-4 sm:gap-6 shrink-0 overflow-x-auto">
                        <div className="text-center min-w-[60px]">
                          <p className="text-[10px] text-muted-foreground">Último</p>
                          <p className="text-xs font-medium text-foreground">{formatTimeAgo(record.last_success_at)}</p>
                        </div>
                        <div className="text-center min-w-[45px]">
                          <p className="text-[10px] text-muted-foreground">Runs</p>
                          <p className="text-xs font-medium text-foreground tabular-nums">{record.total_runs}</p>
                        </div>
                        <div className="text-center min-w-[45px]">
                          <p className="text-[10px] text-muted-foreground">Taxa</p>
                          <p className={cn("text-xs font-medium tabular-nums", successRate >= 95 ? "text-success" : successRate >= 80 ? "text-warning" : "text-destructive")}>
                            {successRate}%
                          </p>
                        </div>
                        <div className="text-center min-w-[40px]">
                          <p className="text-[10px] text-muted-foreground">Duração</p>
                          <DurationBar current={record.last_duration_ms} avg={record.avg_duration_ms} />
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 shrink-0"
                          onClick={() => setExpandedCron(isExpanded ? null : record.id)}
                        >
                          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>

                    {/* Success rate bar */}
                    <div className="mt-3">
                      <Progress value={successRate} className="h-1" />
                    </div>

                    {/* Expanded details */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="mt-4 pt-4 border-t border-border space-y-4">
                            {/* Duration details */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                              <div className="p-2.5 rounded-lg bg-muted/40">
                                <p className="text-[10px] text-muted-foreground">Última duração</p>
                                <p className="text-sm font-semibold text-foreground tabular-nums">
                                  {formatDuration(record.last_duration_ms)}
                                </p>
                              </div>
                              <div className="p-2.5 rounded-lg bg-muted/40">
                                <p className="text-[10px] text-muted-foreground">Duração média</p>
                                <p className="text-sm font-semibold text-foreground tabular-nums">
                                  {formatDuration(record.avg_duration_ms)}
                                </p>
                              </div>
                              <div className="p-2.5 rounded-lg bg-muted/40">
                                <p className="text-[10px] text-muted-foreground">Total falhas</p>
                                <p className={cn("text-sm font-semibold tabular-nums", record.total_failures > 0 ? "text-destructive" : "text-foreground")}>
                                  {record.total_failures}
                                </p>
                              </div>
                              <div className="p-2.5 rounded-lg bg-muted/40">
                                <p className="text-[10px] text-muted-foreground">Falhas seguidas</p>
                                <p className={cn("text-sm font-semibold tabular-nums", record.consecutive_failures > 0 ? "text-destructive" : "text-foreground")}>
                                  {record.consecutive_failures}
                                </p>
                              </div>
                            </div>

                            {/* Execution history mini chart */}
                            <div>
                              <p className="text-[10px] text-muted-foreground mb-2 uppercase tracking-wide">Histórico semanal</p>
                              <div className="h-24">
                                <ResponsiveContainer width="100%" height="100%">
                                  <BarChart data={generateExecutionHistory(record)} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                                    <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                                    <Tooltip
                                      contentStyle={{
                                        backgroundColor: 'hsl(var(--card))',
                                        border: '1px solid hsl(var(--border))',
                                        borderRadius: '6px',
                                        fontSize: '11px',
                                        color: 'hsl(var(--card-foreground))',
                                      }}
                                    />
                                    <Bar dataKey="success" stackId="a" fill="hsl(var(--success))" radius={[0, 0, 0, 0]} />
                                    <Bar dataKey="failures" stackId="a" fill="hsl(var(--destructive))" radius={[1, 1, 0, 0]} />
                                  </BarChart>
                                </ResponsiveContainer>
                              </div>
                            </div>

                            {/* Error message */}
                            {record.last_error && (
                              <div className="p-3 rounded-lg bg-destructive/5 border border-destructive/15">
                                <p className="text-[10px] text-destructive font-medium mb-1">Último erro:</p>
                                <pre className="text-xs text-destructive/90 font-mono whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
                                  {record.last_error}
                                </pre>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })
        )}
      </div>
    </div>
  );
}
