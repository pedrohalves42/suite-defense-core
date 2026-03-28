import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { RpcAgentRow } from '@/types/rpc';
import { useTenant } from '@/hooks/useTenant';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  RefreshCw, 
  Clock, 
  WifiOff, 
  AlertTriangle,
  CheckCircle2,
  Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { useAdaptivePolling } from '@/hooks/useAdaptivePolling';

interface CycleHealth {
  label: string;
  count: number;
  status: 'healthy' | 'warning' | 'critical';
  icon: React.ElementType;
  description: string;
}

export function SystemCyclesHealthCard() {
  const adaptiveInterval = useAdaptivePolling(300000);
  const { tenant } = useTenant();

  const { data: cycles, isLoading } = useQuery({
    queryKey: ['system-cycles-health', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return null;

      // Run all queries in parallel
      const [
        playbooksResult,
        jobsResult,
        agentsResult,
        dlqResult
      ] = await Promise.all([
        // Playbooks running > 1h
        supabase
          .from('playbook_executions')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenant.id)
          .eq('status', 'running')
          .lt('started_at', new Date(Date.now() - 3600000).toISOString()),
        
        // Jobs delivered but not completed
        supabase
          .from('jobs')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenant.id)
          .eq('status', 'delivered')
          .is('completed_at', null),
        
        // Agents offline > 24h - ADR-026: Use RPC then filter client-side
        (async () => {
          const { data } = await supabase.rpc('get_agents_list', {
            p_tenant_id: tenant.id,
            p_include_archived: false
          });
          const threshold = new Date(Date.now() - 86400000).toISOString();
          const count = ((data || []) as unknown as RpcAgentRow[]).filter((a) => a.last_heartbeat && a.last_heartbeat < threshold).length;
          return { count, error: null };
        })(),
        
        // DLQ pending
        supabase
          .from('failed_jobs_dlq')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenant.id)
          .eq('status', 'pending')
      ]);

      return {
        playbooks: playbooksResult.count || 0,
        jobs: jobsResult.count || 0,
        agents: agentsResult.count || 0,
        dlq: dlqResult.count || 0
      };
    },
    enabled: !!tenant?.id,
    refetchInterval: adaptiveInterval,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-muted-foreground" />
            Saúde dos Ciclos Operacionais
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!cycles) return null;

  const getCycleHealth = (count: number, threshold: { warning: number; critical: number }): 'healthy' | 'warning' | 'critical' => {
    if (count >= threshold.critical) return 'critical';
    if (count >= threshold.warning) return 'warning';
    return 'healthy';
  };

  const cycleItems: CycleHealth[] = [
    {
      label: 'Playbooks Travados',
      count: cycles.playbooks,
      status: getCycleHealth(cycles.playbooks, { warning: 1, critical: 3 }),
      icon: Loader2,
      description: 'Executando há mais de 1h'
    },
    {
      label: 'Jobs Pendentes',
      count: cycles.jobs,
      status: getCycleHealth(cycles.jobs, { warning: 5, critical: 10 }),
      icon: Clock,
      description: 'Entregues sem conclusão'
    },
    {
      label: 'Agentes Offline',
      count: cycles.agents,
      status: getCycleHealth(cycles.agents, { warning: 2, critical: 5 }),
      icon: WifiOff,
      description: 'Sem contato há 24h+'
    },
    {
      label: 'DLQ Pendente',
      count: cycles.dlq,
      status: getCycleHealth(cycles.dlq, { warning: 3, critical: 10 }),
      icon: AlertTriangle,
      description: 'Falhas aguardando retry'
    }
  ];

  const overallHealth = cycleItems.some(c => c.status === 'critical') 
    ? 'critical' 
    : cycleItems.some(c => c.status === 'warning') 
      ? 'warning' 
      : 'healthy';

  const allHealthy = cycleItems.every(c => c.count === 0);

  return (
    <Card className={cn(
      "border",
      overallHealth === 'critical' && "border-destructive/50",
      overallHealth === 'warning' && "border-warning/50"
    )}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <RefreshCw className={cn(
            "h-4 w-4",
            overallHealth === 'healthy' && "text-success",
            overallHealth === 'warning' && "text-warning",
            overallHealth === 'critical' && "text-destructive"
          )} />
          Saúde dos Ciclos Operacionais
          {allHealthy && (
            <span className="ml-auto flex items-center gap-1 text-xs text-success">
              <CheckCircle2 className="h-3 w-3" />
              Todos fechados
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {cycleItems.map((cycle) => {
            const Icon = cycle.icon;
            return (
              <div
                key={cycle.label}
                className={cn(
                  "p-3 rounded-lg border",
                  cycle.status === 'healthy' && "bg-muted/30 border-border/50",
                  cycle.status === 'warning' && "bg-warning/5 border-warning/30",
                  cycle.status === 'critical' && "bg-destructive/5 border-destructive/30"
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Icon className={cn(
                    "h-4 w-4",
                    cycle.status === 'healthy' && "text-muted-foreground",
                    cycle.status === 'warning' && "text-warning",
                    cycle.status === 'critical' && "text-destructive"
                  )} />
                  <span className={cn(
                    "text-lg font-bold",
                    cycle.status === 'healthy' && "text-foreground",
                    cycle.status === 'warning' && "text-warning",
                    cycle.status === 'critical' && "text-destructive"
                  )}>
                    {cycle.count}
                  </span>
                </div>
                <p className="text-xs font-medium text-foreground">{cycle.label}</p>
                <p className="text-xs text-muted-foreground">{cycle.description}</p>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
