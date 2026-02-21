import { useState, useEffect } from "react";
import { Activity, CheckCircle2, XCircle, Clock, AlertTriangle, RefreshCw, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

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

export default function CronHealthDashboard() {
  const [records, setRecords] = useState<CronHealthRecord[]>([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Saúde dos Cron Jobs</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monitoramento em tempo real de todos os processos agendados do sistema
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
          <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
          Atualizar
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-border/40">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-success/10 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{healthyCrons}</p>
                <p className="text-xs text-muted-foreground">Saudáveis</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/40">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-destructive/10 flex items-center justify-center">
                <XCircle className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{totalCrons - healthyCrons}</p>
                <p className="text-xs text-muted-foreground">Com problemas</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/40">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-info/10 flex items-center justify-center">
                <Activity className="h-5 w-5 text-info" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{records.reduce((s, r) => s + r.total_runs, 0)}</p>
                <p className="text-xs text-muted-foreground">Total execuções</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/40">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center",
                overallHealth >= 80 ? "bg-success/10" : overallHealth >= 50 ? "bg-warning/10" : "bg-destructive/10"
              )}>
                <Zap className={cn("h-5 w-5",
                  overallHealth >= 80 ? "text-success" : overallHealth >= 50 ? "text-warning" : "text-destructive"
                )} />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{overallHealth}%</p>
                <p className="text-xs text-muted-foreground">Saúde geral</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Cron List */}
      <div className="space-y-3">
        {loading && records.length === 0 ? (
          <Card className="border-border/40">
            <CardContent className="py-12 text-center text-muted-foreground">
              <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
              Carregando...
            </CardContent>
          </Card>
        ) : records.length === 0 ? (
          <Card className="border-border/40">
            <CardContent className="py-12 text-center text-muted-foreground">
              <Activity className="h-8 w-8 mx-auto mb-3 opacity-40" />
              <p className="font-medium">Nenhum cron reportou saúde ainda</p>
              <p className="text-xs mt-1">Os dados aparecerão conforme os crons executarem</p>
            </CardContent>
          </Card>
        ) : (
          records.map((record) => {
            const info = getStatusInfo(record);
            const meta = CRON_LABELS[record.cron_name];
            const Icon = meta?.icon || Activity;
            const successRate = record.total_runs > 0
              ? Math.round(((record.total_runs - record.total_failures) / record.total_runs) * 100)
              : 100;

            return (
              <Card key={record.id} className={cn("border-border/40 transition-colors", info.status === 'critical' && "border-destructive/30")}>
                <CardContent className="py-4">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    {/* Icon + Name */}
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center shrink-0", info.bg)}>
                        <Icon className={cn("h-4 w-4", info.color)} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-sm text-foreground truncate">
                            {meta?.label || record.cron_name}
                          </p>
                          <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 shrink-0", info.color)}>
                            {info.label}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {meta?.description || record.cron_name}
                        </p>
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-4 text-center sm:text-right shrink-0">
                      <div>
                        <p className="text-xs text-muted-foreground">Último sucesso</p>
                        <p className="text-xs font-medium text-foreground">{formatTimeAgo(record.last_success_at)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Execuções</p>
                        <p className="text-xs font-medium text-foreground">{record.total_runs}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Taxa sucesso</p>
                        <p className={cn("text-xs font-medium", successRate >= 95 ? "text-success" : successRate >= 80 ? "text-warning" : "text-destructive")}>
                          {successRate}%
                        </p>
                      </div>
                      <div className="hidden sm:block">
                        <p className="text-xs text-muted-foreground">Falhas seguidas</p>
                        <p className={cn("text-xs font-medium", record.consecutive_failures > 0 ? "text-destructive" : "text-foreground")}>
                          {record.consecutive_failures}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Error message */}
                  {record.last_error && record.consecutive_failures > 0 && (
                    <div className="mt-3 p-2 rounded bg-destructive/5 border border-destructive/10">
                      <p className="text-xs text-destructive font-mono truncate">{record.last_error}</p>
                    </div>
                  )}

                  {/* Success rate bar */}
                  <div className="mt-3">
                    <Progress value={successRate} className="h-1" />
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
