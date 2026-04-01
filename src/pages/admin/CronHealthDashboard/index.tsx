import { Activity, CheckCircle2, XCircle, Clock, AlertTriangle, RefreshCw, Zap, ChevronDown, ChevronUp, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import {
  useCronHealthDashboard, getStatusInfo, CRON_LABELS,
  formatTimeAgo, formatDuration,
} from './useCronHealthDashboard';

function DurationBar({ current, avg }: { current: number | null; avg: number | null }) {
  const max = Math.max(current || 0, avg || 0, 1);
  const currentPct = current ? Math.round((current / max) * 100) : 0;
  const avgPct = avg ? Math.round((avg / max) * 100) : 0;

  return (
    <div className="flex items-end gap-0.5 h-5">
      <div className="w-2 rounded-t bg-info/60 transition-all" style={{ height: `${avgPct}%`, minHeight: '2px' }} title={`Média: ${formatDuration(avg)}`} />
      <div className={cn("w-2 rounded-t transition-all", current && avg && current > avg * 1.5 ? "bg-warning" : "bg-success")} style={{ height: `${currentPct}%`, minHeight: '2px' }} title={`Última: ${formatDuration(current)}`} />
    </div>
  );
}

export default function CronHealthDashboard() {
  const {
    records, loading, refetch,
    tenantJobStats, expandedCron, setExpandedCron,
    healthyCrons, totalCrons, totalRuns, globalSuccessRate,
  } = useCronHealthDashboard();

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground">Saúde dos Cron Jobs</h1>
          <p className="text-xs md:text-sm text-muted-foreground mt-1">Monitoramento dos processos agendados da plataforma</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={loading}>
          <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
          Atualizar
        </Button>
      </div>

      <Alert className="border-info/30 bg-info/5">
        <Info className="h-4 w-4 text-info" />
        <AlertDescription className="text-xs text-muted-foreground">
          Crons são processos globais da plataforma que servem todos os tenants.
          {tenantJobStats && (
            <span className="ml-1 font-medium text-foreground">
              Seu tenant processou {tenantJobStats.total} jobs nas últimas 24h (taxa de sucesso: {tenantJobStats.successRate}%).
            </span>
          )}
        </AlertDescription>
      </Alert>

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
            <motion.div key={card.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05, duration: 0.3 }}>
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

      {records.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.4 }}>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Execuções por Cron (acumulado)</CardTitle>
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
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px', color: 'hsl(var(--card-foreground))' }} />
                    <Bar dataKey="sucesso" stackId="a" fill="hsl(var(--success))" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="falhas" stackId="a" fill="hsl(var(--destructive))" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      <div className="space-y-3">
        {loading && records.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground"><RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />Carregando...</CardContent></Card>
        ) : records.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground"><Activity className="h-8 w-8 mx-auto mb-3 opacity-40" /><p className="font-medium">Nenhum cron reportou saúde ainda</p><p className="text-xs mt-1">Os dados aparecerão conforme os crons executarem</p></CardContent></Card>
        ) : (
          records.map((record, idx) => {
            const info = getStatusInfo(record);
            const meta = CRON_LABELS[record.cron_name];
            const IconMap: Record<string, typeof Activity> = { 'maintenance-cron': Clock, 'process-agent-updates': RefreshCw, 'process-scheduled-jobs': Zap, 'invoke-scheduled-jobs': Activity, 'cron-sentinel': AlertTriangle };
            const Icon = IconMap[record.cron_name] || Activity;
            const successRate = record.total_runs > 0 ? Math.round(((record.total_runs - record.total_failures) / record.total_runs) * 100) : 100;
            const isExpanded = expandedCron === record.id;
            const needsAttention = info.status === 'critical' || info.status === 'stale';

            return (
              <motion.div key={record.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.04, duration: 0.3 }}>
                <Card className={cn("transition-colors", info.status === 'critical' && "border-destructive/30", info.status === 'stale' && "border-warning/30")}>
                  <CardContent className="py-4">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center shrink-0 relative", info.bg)}>
                          <Icon className={cn("h-4 w-4", info.color)} />
                          {needsAttention && <span className={cn("absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full animate-pulse", info.status === 'critical' ? "bg-destructive" : "bg-warning")} />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-sm text-foreground truncate">{meta?.label || record.cron_name}</p>
                            <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 shrink-0", info.color)}>{info.label}</Badge>
                          </div>
                          <p className="text-[11px] text-muted-foreground truncate">{meta?.description || record.cron_name}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 sm:gap-6 shrink-0 overflow-x-auto">
                        <div className="text-center min-w-[60px]"><p className="text-[10px] text-muted-foreground">Último</p><p className="text-xs font-medium text-foreground">{formatTimeAgo(record.last_success_at)}</p></div>
                        <div className="text-center min-w-[45px]"><p className="text-[10px] text-muted-foreground">Runs</p><p className="text-xs font-medium text-foreground tabular-nums">{record.total_runs}</p></div>
                        <div className="text-center min-w-[45px]"><p className="text-[10px] text-muted-foreground">Taxa</p><p className={cn("text-xs font-medium tabular-nums", successRate >= 95 ? "text-success" : successRate >= 80 ? "text-warning" : "text-destructive")}>{successRate}%</p></div>
                        <div className="text-center min-w-[40px]"><p className="text-[10px] text-muted-foreground">Duração</p><DurationBar current={record.last_duration_ms} avg={record.avg_duration_ms} /></div>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0" onClick={() => setExpandedCron(isExpanded ? null : record.id)}>
                          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                    <div className="mt-3"><Progress value={successRate} className="h-1" /></div>
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                          <div className="mt-4 pt-4 border-t border-border space-y-4">
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                              <div className="p-2.5 rounded-lg bg-muted/40"><p className="text-[10px] text-muted-foreground">Última duração</p><p className="text-sm font-semibold text-foreground tabular-nums">{formatDuration(record.last_duration_ms)}</p></div>
                              <div className="p-2.5 rounded-lg bg-muted/40"><p className="text-[10px] text-muted-foreground">Duração média</p><p className="text-sm font-semibold text-foreground tabular-nums">{formatDuration(record.avg_duration_ms)}</p></div>
                              <div className="p-2.5 rounded-lg bg-muted/40"><p className="text-[10px] text-muted-foreground">Total falhas</p><p className={cn("text-sm font-semibold tabular-nums", record.total_failures > 0 ? "text-destructive" : "text-foreground")}>{record.total_failures}</p></div>
                              <div className="p-2.5 rounded-lg bg-muted/40"><p className="text-[10px] text-muted-foreground">Falhas seguidas</p><p className={cn("text-sm font-semibold tabular-nums", record.consecutive_failures > 0 ? "text-destructive" : "text-foreground")}>{record.consecutive_failures}</p></div>
                            </div>
                            {record.last_error && (
                              <div className="p-3 rounded-lg bg-destructive/5 border border-destructive/15">
                                <p className="text-[10px] text-destructive font-medium mb-1">Último erro:</p>
                                <pre className="text-xs text-destructive/90 font-mono whitespace-pre-wrap break-all max-h-32 overflow-y-auto">{record.last_error}</pre>
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
