import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActiveTenant } from '@/hooks/useActiveTenant';

export interface ClientDashboardStats {
  totalAgents: number;
  onlineAgents: number;
  offlineAgents: number;
  unresolvedAlerts: number;
  criticalAlerts: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recentReports: any[];
  vulnerabilities: number;
  healthScore: number;
  hasAvIssues: boolean;
}

export function useClientDashboard() {
  const { activeTenant: tenant, loading: tenantLoading } = useActiveTenant();

  const { data: stats, isLoading } = useQuery({
    queryKey: ['client-dashboard-stats', tenant?.id],
    queryFn: async (): Promise<ClientDashboardStats | null> => {
      if (!tenant?.id) return null;

      const { data: agentsRaw } = await supabase.rpc('get_agents_list', {
        p_tenant_id: tenant.id,
        p_include_archived: false,
      });
      const agents = ((agentsRaw || []) as unknown[]).map((a: Record<string, unknown>) => ({
        id: a.id, status: a.status, last_heartbeat: a.last_heartbeat, agent_name: a.agent_name,
      }));

      const [alertsRes, reportsRes, vulnRes, avRes] = await Promise.all([
        supabase.from('system_alerts').select('id, alert_type, severity, resolved')
          .eq('tenant_id', tenant.id).eq('resolved', false)
          .order('created_at', { ascending: false }).limit(10),
        supabase.from('generated_reports').select('id, title, created_at, risk_score')
          .eq('tenant_id', tenant.id).order('created_at', { ascending: false }).limit(5),
        supabase.from('vuln_findings').select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenant.id),
        supabase.from('antivirus_status').select('status, threats_found')
          .eq('tenant_id', tenant.id),
      ]);

      const alerts = alertsRes.data;
      const reports = reportsRes.data;
      const vulnCount = vulnRes.count;
      const avStatus = avRes.data;

      const cutoff = new Date(Date.now() - 30 * 60 * 1000);
      const onlineAgents = agents?.filter(a =>
        a.last_heartbeat && new Date(String(a.last_heartbeat)) > cutoff
      ).length || 0;
      const offlineAgents = (agents?.length || 0) - onlineAgents;

      let healthScore = 100;
      const criticalAlerts = alerts?.filter(a => a.severity === 'critical').length || 0;
      healthScore -= criticalAlerts * 15;
      healthScore -= ((alerts?.length || 0) - criticalAlerts) * 5;
      healthScore -= Math.min((vulnCount || 0) * 2, 20);
      const totalAgents = agents?.length || 0;
      if (totalAgents > 0) {
        healthScore -= Math.round((offlineAgents / totalAgents) * 20);
      }
      const avDisabled = avStatus?.filter(a => a.status !== 'enabled').length || 0;
      const avThreats = avStatus?.reduce((sum, a) => sum + (a.threats_found || 0), 0) || 0;
      healthScore -= avDisabled * 10;
      healthScore -= avThreats * 5;
      healthScore = Math.max(0, Math.min(100, healthScore));

      return {
        totalAgents: agents?.length || 0,
        onlineAgents,
        offlineAgents,
        unresolvedAlerts: alerts?.length || 0,
        criticalAlerts,
        recentReports: reports || [],
        vulnerabilities: vulnCount || 0,
        healthScore,
        hasAvIssues: avDisabled > 0 || avThreats > 0,
      };
    },
    enabled: !tenantLoading && !!tenant?.id,
    refetchInterval: false,
    staleTime: 300_000,
    refetchOnWindowFocus: true,
  });

  return { stats, isLoading };
}
