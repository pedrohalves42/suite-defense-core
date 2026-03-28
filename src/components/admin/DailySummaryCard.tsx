/**
 * DailySummaryCard - Resumo do dia dos agentes
 * Mostra atividade, impedimentos e custos evitados no dia.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { useAgentSnapshots, getAgentStatusCounts } from '@/hooks/useAgentSnapshots';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  CalendarDays, CheckCircle2, AlertTriangle, ShieldCheck, 
  Activity, Clock, XCircle, Zap, DollarSign
} from 'lucide-react';
import { format, ptBR } from '@/lib/date-utils';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

// Cost mapping per action type (R$)
const ACTION_COST_MAP: Record<string, number> = {
  kill_process: 2500,
  firewall_block: 1800,
  patch_apply: 4000,
  disk_cleanup: 200,
  quarantine: 3000,
  service_restart: 500,
  block_domain: 1200,
};

interface DailySummary {
  jobsTotal: number;
  jobsSuccess: number;
  jobsFailed: number;
  jobsExpired: number;
  blockedAttempts: number;
  actionsExecuted: number;
  alertsCreated: number;
  costAvoided: number;
  agentsOnline: number;
  agentsOffline: number;
  agentsTotal: number;
  topEvents: Array<{ type: string; description: string; severity: string }>;
}

export function DailySummaryCard() {
  const { tenant } = useTenant();
  const { data: snapshots } = useAgentSnapshots();
  const agentCounts = getAgentStatusCounts(snapshots);

  const { data: summary, isLoading } = useQuery({
    queryKey: ['daily-summary', tenant?.id],
    queryFn: async (): Promise<DailySummary | null> => {
      if (!tenant?.id) return null;

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayISO = today.toISOString();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- tables not in generated types
      const sb = supabase;

      // Parallel fetches for today's data
      const [jobsRes, blockedRes, actionsRes, alertsRes] = await Promise.all([
        sb.from('jobs').select('status').eq('tenant_id', tenant.id).gte('created_at', todayISO),
        sb.from('blocked_access_attempts').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id).gte('attempted_at', todayISO),
        sb.from('autonomy_actions' as never).select('action_type, status').eq('tenant_id', tenant.id).gte('created_at', todayISO),
        sb.from('system_alerts').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id).gte('created_at', todayISO),
      ]);

      const jobs: Array<{ status: string }> = jobsRes.data || [];
      const actions: Array<{ action_type: string; status: string }> = actionsRes.data || [];

      const jobsSuccess = jobs.filter(j => j.status === 'completed').length;
      const jobsFailed = jobs.filter(j => j.status === 'failed').length;
      const jobsExpired = jobs.filter(j => j.status === 'expired').length;
      
      const executedActions = actions.filter(a => a.status === 'executed' || a.status === 'completed');
      let costAvoided = 0;
      for (const action of executedActions) {
        costAvoided += ACTION_COST_MAP[action.action_type] || 300;
      }

      // Build top events narrative
      const topEvents: Array<{ type: string; description: string; severity: string }> = [];
      
      if (jobsFailed > 0) {
        topEvents.push({ 
          type: 'warning', 
          description: `${jobsFailed} job${jobsFailed > 1 ? 's' : ''} falharam hoje`, 
          severity: 'high' 
        });
      }
      if (jobsExpired > 0) {
        topEvents.push({ 
          type: 'info', 
          description: `${jobsExpired} job${jobsExpired > 1 ? 's' : ''} expiraram (agentes offline)`, 
          severity: 'medium' 
        });
      }
      if ((blockedRes.count || 0) > 0) {
        topEvents.push({ 
          type: 'success', 
          description: `${blockedRes.count} tentativa${blockedRes.count > 1 ? 's' : ''} de acesso bloqueada${blockedRes.count > 1 ? 's' : ''}`, 
          severity: 'low' 
        });
      }
      if (executedActions.length > 0) {
        topEvents.push({ 
          type: 'success', 
          description: `${executedActions.length} ação${executedActions.length > 1 ? 'ões' : ''} automática${executedActions.length > 1 ? 's' : ''} executada${executedActions.length > 1 ? 's' : ''}`, 
          severity: 'low' 
        });
      }

      return {
        jobsTotal: jobs.length,
        jobsSuccess,
        jobsFailed,
        jobsExpired,
        blockedAttempts: blockedRes.count || 0,
        actionsExecuted: executedActions.length,
        alertsCreated: alertsRes.count || 0,
        costAvoided,
        agentsOnline: agentCounts.online + agentCounts.warning,
        agentsOffline: agentCounts.offline + agentCounts.never_connected,
        agentsTotal: agentCounts.total,
        topEvents,
      };
    },
    enabled: !!tenant?.id,
    refetchInterval: 300000,
    refetchIntervalInBackground: false,
  });

  if (isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (!summary) return null;

  const successRate = summary.jobsTotal > 0 
    ? Math.round((summary.jobsSuccess / summary.jobsTotal) * 100) 
    : 100;

  const hasIssues = summary.jobsFailed > 0 || summary.jobsExpired > 0 || summary.agentsOffline > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: 0.1 }}
    >
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary/10">
                <CalendarDays className="h-4 w-4 text-primary" />
              </div>
              <div>
                <CardTitle className="text-sm font-semibold">Resumo do Dia</CardTitle>
                <CardDescription className="text-[11px]">
                  {format(new Date(), "EEEE, dd 'de' MMMM", { locale: ptBR })}
                </CardDescription>
              </div>
            </div>
            <Badge variant={hasIssues ? 'outline' : 'default'} className={cn(
              "text-[10px]",
              !hasIssues && "bg-green-500/10 text-green-500 border-green-500/30"
            )}>
              {hasIssues ? 'Atenção necessária' : 'Dia tranquilo ✓'}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Quick Stats Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
            <MiniStat
              icon={<Activity className="h-3.5 w-3.5" />}
              label="Jobs Executados"
              value={`${summary.jobsTotal}`}
              accent={summary.jobsTotal > 0 ? 'green' : 'muted'}
            />
            <MiniStat
              icon={<CheckCircle2 className="h-3.5 w-3.5" />}
              label="Taxa de Sucesso"
              value={`${successRate}%`}
              accent={successRate >= 80 ? 'green' : successRate >= 50 ? 'amber' : 'red'}
            />
            <MiniStat
              icon={<ShieldCheck className="h-3.5 w-3.5" />}
              label="Ameaças Bloqueadas"
              value={`${summary.blockedAttempts}`}
              accent={summary.blockedAttempts > 0 ? 'green' : 'muted'}
            />
            <MiniStat
              icon={<DollarSign className="h-3.5 w-3.5" />}
              label="Custo Evitado"
              value={summary.costAvoided > 0 ? `R$ ${(summary.costAvoided / 100).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}` : 'R$ 0'}
              accent={summary.costAvoided > 0 ? 'emerald' : 'muted'}
            />
          </div>

          {/* Events Timeline */}
          {summary.topEvents.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-border/30">
              <div className="flex items-center gap-1.5 mb-1">
                <Zap className="h-3 w-3 text-muted-foreground" />
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                  O que aconteceu hoje
                </span>
              </div>
              {summary.topEvents.map((event, idx) => (
                <div key={idx} className="flex items-start gap-2 text-xs">
                  <span className={cn(
                    "mt-1.5 inline-block w-1.5 h-1.5 rounded-full shrink-0",
                    event.type === 'warning' && "bg-amber-500",
                    event.type === 'success' && "bg-green-500",
                    event.type === 'info' && "bg-blue-500",
                    event.type === 'error' && "bg-red-500",
                  )} />
                  <span className="text-muted-foreground leading-snug">{event.description}</span>
                </div>
              ))}
              {summary.topEvents.length === 0 && (
                <p className="text-xs text-muted-foreground">Nenhum evento significativo registrado hoje.</p>
              )}
            </div>
          )}

          {/* Impediments */}
          {(summary.jobsFailed > 0 || summary.jobsExpired > 0 || summary.agentsOffline > 0) && (
            <div className="space-y-2 pt-2 border-t border-border/30">
              <div className="flex items-center gap-1.5 mb-1">
                <AlertTriangle className="h-3 w-3 text-amber-500" />
                <span className="text-[11px] font-medium text-amber-500 uppercase tracking-wider">
                  Impedimentos
                </span>
              </div>
              <div className="space-y-1.5">
                {summary.agentsOffline > 0 && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <XCircle className="h-3 w-3 text-red-500 shrink-0" />
                    <span>{summary.agentsOffline} computador{summary.agentsOffline > 1 ? 'es' : ''} sem comunicação — jobs podem não ser entregues</span>
                  </div>
                )}
                {summary.jobsFailed > 0 && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <XCircle className="h-3 w-3 text-amber-500 shrink-0" />
                    <span>{summary.jobsFailed} job{summary.jobsFailed > 1 ? 's' : ''} falharam — verificar logs dos agentes</span>
                  </div>
                )}
                {summary.jobsExpired > 0 && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span>{summary.jobsExpired} job{summary.jobsExpired > 1 ? 's' : ''} expiraram (TTL excedido)</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

function MiniStat({ icon, label, value, accent }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent: 'green' | 'red' | 'amber' | 'emerald' | 'muted';
}) {
  const colors = {
    green: 'text-green-500',
    red: 'text-red-500',
    amber: 'text-amber-500',
    emerald: 'text-emerald-500',
    muted: 'text-foreground',
  };

  return (
    <div className="p-2.5 rounded-lg bg-muted/30 border border-border/40">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-muted-foreground">{icon}</span>
        <span className="text-[10px] text-muted-foreground font-medium truncate">{label}</span>
      </div>
      <p className={cn("text-lg font-bold leading-none", colors[accent])}>
        {value}
      </p>
    </div>
  );
}
