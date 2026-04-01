import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useTenant } from '@/hooks/useTenant';

export interface CronHealthRecord {
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
  metadata: any | null;
  updated_at: string;
}

export interface TenantJobStats {
  total: number;
  completed: number;
  failed: number;
  successRate: number;
}

export function getStatusInfo(record: CronHealthRecord) {
  if (record.consecutive_failures >= 5) return { status: 'critical', color: 'text-destructive', bg: 'bg-destructive/10', label: 'Crítico' };
  if (record.consecutive_failures >= 2) return { status: 'warning', color: 'text-warning', bg: 'bg-warning/10', label: 'Atenção' };
  if (!record.last_success_at) return { status: 'unknown', color: 'text-muted-foreground', bg: 'bg-muted', label: 'Sem dados' };

  const lastSuccess = new Date(record.last_success_at);
  const minutesSince = (Date.now() - lastSuccess.getTime()) / 60000;
  if (minutesSince > 60) return { status: 'stale', color: 'text-warning', bg: 'bg-warning/10', label: 'Atrasado' };
  return { status: 'healthy', color: 'text-success', bg: 'bg-success/10', label: 'Saudável' };
}

export const CRON_LABELS: Record<string, { label: string; description: string }> = {
  'maintenance-cron': { label: 'Manutenção', description: 'Limpeza e expiração de jobs' },
  'process-agent-updates': { label: 'Atualizações', description: 'Push de updates para agentes' },
  'process-scheduled-jobs': { label: 'Jobs Agendados', description: 'Processamento de tarefas recorrentes' },
  'invoke-scheduled-jobs': { label: 'Invocação de Jobs', description: 'Disparo de jobs agendados' },
  'cron-sentinel': { label: 'Sentinela', description: 'Monitoramento de falhas silenciosas' },
};

export function formatTimeAgo(dateStr: string | null) {
  if (!dateStr) return '—';
  try {
    const { formatDistanceToNow } = require('date-fns');
    const { ptBR } = require('date-fns/locale');
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: ptBR });
  } catch {
    return '—';
  }
}

export function formatDuration(ms: number | null) {
  if (ms === null || ms === undefined) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function useCronHealthDashboard() {
  const { tenant } = useTenant();
  const [expandedCron, setExpandedCron] = useState<string | null>(null);

  const { data: records = [], isLoading: loading, refetch } = useQuery({
    queryKey: ['cron-health', tenant?.id],
    queryFn: async (): Promise<CronHealthRecord[]> => {
      const { data, error } = await supabase
        .from('cron_health')
        .select('*')
        .order('consecutive_failures', { ascending: false });

      if (error) {
        toast.error('Erro ao carregar saúde dos crons');
        return [];
      }
      return (data || []) as unknown as CronHealthRecord[];
    },
    enabled: !!tenant?.id,
    refetchInterval: false,
    staleTime: 600_000,
  });

  const { data: tenantJobStats } = useQuery({
    queryKey: ['cron-tenant-job-stats', tenant?.id],
    queryFn: async (): Promise<TenantJobStats | null> => {
      if (!tenant?.id) return null;
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const { data, error } = await supabase
        .from('jobs')
        .select('id, status', { count: 'exact', head: false })
        .eq('tenant_id', tenant.id)
        .gte('created_at', twentyFourHoursAgo);

      if (error) return null;

      const total = data?.length || 0;
      const completed = data?.filter(j => j.status === 'completed').length || 0;
      const failed = data?.filter(j => j.status === 'failed').length || 0;

      return { total, completed, failed, successRate: total > 0 ? Math.round((completed / total) * 100) : 100 };
    },
    enabled: !!tenant?.id,
    refetchInterval: false,
    staleTime: 600_000,
  });

  const healthyCrons = records.filter(r => getStatusInfo(r).status === 'healthy').length;
  const totalCrons = records.length;
  const totalRuns = records.reduce((s, r) => s + r.total_runs, 0);
  const totalFailures = records.reduce((s, r) => s + r.total_failures, 0);
  const globalSuccessRate = totalRuns > 0 ? Math.round(((totalRuns - totalFailures) / totalRuns) * 100) : 100;

  return {
    records, loading, refetch,
    tenantJobStats,
    expandedCron, setExpandedCron,
    healthyCrons, totalCrons, totalRuns, globalSuccessRate,
  };
}
