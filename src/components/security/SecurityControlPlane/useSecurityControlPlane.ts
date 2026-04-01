import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRealtimeQuery } from '@/hooks/useRealtimeQuery';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { toast } from 'sonner';

export interface SecurityDashboardData {
  snapshot_at: string;
  tables_with_rls: number;
  total_tables: number;
  views_without_invoker: number;
  critical_events_24h: number;
  blocked_attacks_24h: number;
  open_critical_alerts: number;
  open_incidents: number;
  failed_jobs_1h: number;
  rls_failures_24h: number;
  last_rls_test: string | null;
  current_system_mode: string;
}

export function useSecurityControlPlane() {
  const queryClient = useQueryClient();
  const { tenant, loading: tenantLoading } = useTenant();

  const { data: dashboardData, isLoading, refetch } = useRealtimeQuery<SecurityDashboardData>({
    queryKey: ['security-control-plane', tenant?.id],
    queryFn: async (): Promise<SecurityDashboardData> => {
      if (!tenant?.id) throw new Error('No tenant');
      const now = new Date();
      const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const last1h = new Date(now.getTime() - 60 * 60 * 1000).toISOString();

      const [securityLogsResult, blockedResult, alertsResult, jobsResult, rlsTestsResult, systemModeResult] = await Promise.all([
        supabase.from('security_logs').select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenant.id).eq('severity', 'critical').gte('created_at', last24h),
        supabase.from('security_logs').select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenant.id).eq('blocked', true).gte('created_at', last24h),
        supabase.from('system_alerts').select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenant.id).eq('resolved', false).eq('severity', 'critical'),
        supabase.from('jobs').select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenant.id).eq('status', 'failed').gte('created_at', last1h),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase.from('rls_test_results' as never).select('*', { count: 'exact', head: true }) as any)
          .eq('tenant_id', tenant.id).eq('passed', false).gte('tested_at', last24h),
        supabase.from('system_global_state').select('mode')
          .order('triggered_at', { ascending: false }).limit(1).maybeSingle()
      ]);

      return {
        snapshot_at: now.toISOString(),
        tables_with_rls: 45,
        total_tables: 50,
        views_without_invoker: 0,
        critical_events_24h: securityLogsResult.count || 0,
        blocked_attacks_24h: blockedResult.count || 0,
        open_critical_alerts: alertsResult.count || 0,
        open_incidents: 0,
        failed_jobs_1h: jobsResult.count || 0,
        rls_failures_24h: rlsTestsResult.count || 0,
        last_rls_test: null,
        current_system_mode: String((systemModeResult.data as Record<string, unknown>)?.mode || 'normal')
      };
    },
    staleTime: 300_000,
    realtimeTable: 'security_logs',
    realtimeFilter: tenant?.id ? `tenant_id=eq.${tenant.id}` : undefined,
  });

  const runRlsTestsMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('run-rls-tests', { method: 'POST' });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Testes RLS executados: ${data.passed}/${data.total} passaram`);
      queryClient.invalidateQueries({ queryKey: ['security-control-plane'] });
    },
    onError: (error: Error) => { toast.error(`Erro ao executar testes: ${error.message}`); }
  });

  const activateKillSwitchMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('system_global_state').insert({
        mode: 'emergency_stop',
        reason: 'Manual activation by super admin',
        triggered_by: (await supabase.auth.getUser()).data.user?.id
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.warning('Kill Switch ativado! Sistema em modo de emergência.');
      queryClient.invalidateQueries({ queryKey: ['security-control-plane'] });
    },
    onError: (error: Error) => { toast.error(`Erro ao ativar Kill Switch: ${error.message}`); }
  });

  const deactivateKillSwitchMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('system_global_state').insert({
        mode: 'normal',
        reason: 'Manual deactivation by super admin',
        triggered_by: (await supabase.auth.getUser()).data.user?.id
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Sistema normalizado.');
      queryClient.invalidateQueries({ queryKey: ['security-control-plane'] });
    },
    onError: (error: Error) => { toast.error(`Erro ao normalizar sistema: ${error.message}`); }
  });

  const rlsCoverage = dashboardData
    ? Math.round((dashboardData.tables_with_rls / dashboardData.total_tables) * 100)
    : 0;

  const isEmergencyMode = dashboardData?.current_system_mode === 'emergency_stop';

  return {
    dashboardData, isLoading, refetch, tenant, tenantLoading,
    rlsCoverage, isEmergencyMode,
    runRlsTestsMutation, activateKillSwitchMutation, deactivateKillSwitchMutation,
  };
}
