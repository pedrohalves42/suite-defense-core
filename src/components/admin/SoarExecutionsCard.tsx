/**
 * SOAR Executions Dashboard Card
 * Shows playbook execution summary by trigger type and status
 */

import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Zap, CheckCircle, XCircle, Clock, AlertTriangle, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from '@/lib/date-utils';
import { useRealtimeQuery } from '@/hooks/useRealtimeQuery';

interface SoarSummary {
  status: string;
  trigger_type: string;
  playbook_name: string;
  execution_count: number;
  last_execution: string | null;
  completed_count: number;
  failed_count: number;
}

const triggerTypeLabels: Record<string, string> = {
  suspicious_process: 'Processo Suspeito',
  agent_offline: 'Agente Offline',
  job_failed: 'Job Falhou',
  vulnerability_critical: 'Vulnerabilidade Crítica',
  vulnerability_high: 'Vulnerabilidade Alta',
  dns_blocked: 'DNS Bloqueado',
  integrity_low: 'Integridade Baixa',
  unauthorized_service: 'Serviço Não Autorizado',
  suspicious_web_activity: 'Navegação Suspeita',
  manual: 'Manual',
};

const statusConfig: Record<string, { label: string; icon: React.ElementType; className: string }> = {
  pending: { label: 'Pendente', icon: Clock, className: 'text-yellow-500 bg-yellow-500/10' },
  in_progress: { label: 'Em Execução', icon: Activity, className: 'text-blue-500 bg-blue-500/10' },
  completed: { label: 'Concluído', icon: CheckCircle, className: 'text-green-500 bg-green-500/10' },
  failed: { label: 'Falhou', icon: XCircle, className: 'text-red-500 bg-red-500/10' },
  partial_failure: { label: 'Parcial', icon: AlertTriangle, className: 'text-orange-500 bg-orange-500/10' },
};

export function SoarExecutionsCard() {
  const { tenant } = useTenant();

  const { data: summaryData, isLoading } = useRealtimeQuery({
    queryKey: ['soar-execution-summary', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      
      const { data, error } = await supabase
        .from('playbook_executions')
        .select('id, status, trigger_source, auto_executed, dry_run, risk_score, triggered_by, playbook_snapshot, triggered_at')
        .eq('tenant_id', tenant.id)
        .order('triggered_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return data || [];
    },
    enabled: !!tenant?.id,
    refetchInterval: adaptiveInterval,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const executions = summaryData || [];
  
  const stats = {
    total: executions.length,
    pending: executions.filter(e => e.status === 'pending').length,
    completed: executions.filter(e => e.status === 'completed').length,
    failed: executions.filter(e => e.status === 'failed').length,
    autoExecuted: executions.filter(e => e.auto_executed && !e.dry_run).length,
    dryRun: executions.filter(e => e.dry_run).length,
  };

  // Group by trigger_source
  const byTrigger = executions.reduce((acc, exec) => {
    const key = exec.trigger_source || 'unknown';
    if (!acc[key]) acc[key] = { count: 0, latest: exec.triggered_at };
    acc[key].count++;
    return acc;
  }, {} as Record<string, { count: number; latest: string | null }>);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Zap className="h-4 w-4 text-muted-foreground" />
            SOAR Executions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-3">
            <div className="h-8 bg-muted rounded" />
            <div className="h-20 bg-muted rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          SOAR Executions
        </CardTitle>
        <CardDescription className="text-xs">
          Playbooks de resposta automática
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-2">
          <div className="p-2 rounded-lg bg-primary/10 text-center">
            <p className="text-lg font-bold text-primary">{stats.total}</p>
            <p className="text-[10px] text-muted-foreground">Total</p>
          </div>
          <div className="p-2 rounded-lg bg-yellow-500/10 text-center">
            <p className="text-lg font-bold text-yellow-600">{stats.pending}</p>
            <p className="text-[10px] text-muted-foreground">Pendentes</p>
          </div>
          <div className="p-2 rounded-lg bg-green-500/10 text-center">
            <p className="text-lg font-bold text-green-600">{stats.autoExecuted}</p>
            <p className="text-[10px] text-muted-foreground">Auto</p>
          </div>
        </div>

        {/* By Trigger Type */}
        {Object.keys(byTrigger).length > 0 ? (
          <ScrollArea className="h-[140px]">
            <div className="space-y-2">
              {Object.entries(byTrigger)
                .sort((a, b) => b[1].count - a[1].count)
                .map(([trigger, info]) => (
                  <div key={trigger} className="flex items-center justify-between text-xs p-2 rounded-lg bg-muted/30">
                    <div className="flex items-center gap-2 min-w-0">
                      <AlertTriangle className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="truncate">{triggerTypeLabels[trigger] || trigger}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {info.count}
                      </Badge>
                      {info.latest && (
                        <span className="text-muted-foreground text-[10px]">
                          {formatDistanceToNow(new Date(info.latest), { addSuffix: true })}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </ScrollArea>
        ) : (
          <div className="text-center py-4">
            <Zap className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">Nenhuma execução registrada</p>
          </div>
        )}

        {/* Dry Run indicator */}
        {stats.dryRun > 0 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 p-2 rounded">
            <Badge variant="outline" className="text-[10px]">Shadow Mode</Badge>
            <span>{stats.dryRun} execuções em dry-run</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
