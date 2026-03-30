/**
 * useUnifiedMetrics — Fonte ÚNICA de dados para todos os dashboards
 * 
 * Centraliza as queries de:
 * - system_alerts (alertas ativos)
 * - blocked_access_attempts (acessos bloqueados)
 * - agent_evidence_logs (eventos de segurança dos agentes)
 * - vuln_findings (pontos fracos)
 * - ai_insights (sugestões automáticas)
 * 
 * Todas as páginas devem importar daqui para garantir consistência.
 * React Query cuida do cache — múltiplas páginas usando o mesmo queryKey
 * compartilham automaticamente os mesmos dados.
 */
import { useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { useAgentSnapshots, getAgentStatusCounts } from '@/hooks/useAgentSnapshots';
import { subDays } from 'date-fns';
import { useRealtimeQuery } from '@/hooks/useRealtimeQuery';

// === Modelo de custo REALISTA para PMEs brasileiras ===
// Valores conservadores baseados em custo médio de suporte técnico local
export const COST_MODEL = {
  security_event_critical: 500,   // Incidente crítico real (ransomware, breach)
  security_event_high: 200,       // Ameaça alta real
  security_event_medium: 60,      // Ameaça média
  auto_repair: 45,                // Chamado técnico evitado
  auto_recovery: 150,             // Restauração de serviço
  policy_drift: 60,               // Correção de conformidade
  blocked_access: 5,              // Bloqueio DNS/domínio (baixo custo unitário, alto volume)
  firewall_enforcement: 40,
  agent_offline_per_hour: 25
};

export interface UnifiedMetrics {
  // Agents
  agents: {
    total: number;
    online: number;
    offline: number;
    warning: number;
    neverConnected: number;
    protectionPercent: number;
  };
  // Alerts
  alerts: {
    total: number;
    active: number;
    critical: number;
    items: Array<{ id: string; severity: string; message: string; alert_type: string; status: string; title: string; created_at: string }>;
  };
  // Blocked access
  blocked: {
    last7d: number;
    items: Array<{ id: string; agent_name: string; domain: string; attempted_at: string; blocked_by: string }>;
  };
  // Evidence (security events from agents)
  evidence: {
    last7d: Array<{ event_type: string; severity: string }>;
    last30d: Array<{ event_type: string; severity: string }>;
    incidentsContained: number;
    autoRepairs: number;
    autoRecoveries: number;
    policyDrifts: number;
    criticalPrevented: number;
    highPrevented: number;
    mediumPrevented: number;
  };
  // Vulnerabilities
  vulnerabilities: {
    total: number;
    critical: number;
  };
  // AI Insights
  insights: {
    pending: number;
  };
  // Derived scores
  securityScore: number;
  globalStatus: {
    emoji: string;
    title: string;
    description: string;
    variant: 'success' | 'warning' | 'danger';
  };
  // Financial impact (30d)
  financial: {
    totalCostAvoided: number;
    hoursOfITSaved: number;
    breakdown: Record<string, number>;
  };
  // Metadata
  lastUpdate: Date;
}

export function useUnifiedMetrics() {
  const { tenant, loading: tenantLoading } = useTenant();
  const { data: snapshots, isLoading: snapshotsLoading } = useAgentSnapshots();
  const agentCounts = getAgentStatusCounts(snapshots);

  const { data, isLoading, refetch, isFetched } = useRealtimeQuery<Omit<UnifiedMetrics, 'agents' | 'securityScore' | 'globalStatus'> & { _raw: true }>({
    queryKey: ['unified-metrics', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) throw new Error('No tenant');
      const sb = supabase;
      const now = new Date();
      const sevenDaysAgo = subDays(now, 7).toISOString();
      const thirtyDaysAgo = subDays(now, 30).toISOString();

      const [alertsRes, blockedRes, evidenceSummaryRes, vulnTotalRes, vulnCriticalRes, insightsRes, blockedItemsRes] = await Promise.all([
        sb.from('system_alerts')
          .select('id, severity, message, alert_type, status, title, created_at')
          .eq('tenant_id', tenant.id)
          .order('created_at', { ascending: false })
          .limit(100),
        sb.from('blocked_access_attempts')
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenant.id)
          .gte('attempted_at', sevenDaysAgo),
        sb.rpc('get_evidence_summary', { p_tenant_id: tenant.id }),
        sb.from('vuln_findings')
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenant.id),
        sb.from('vuln_findings')
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenant.id)
          .in('severity', ['critical', 'high']),
        sb.from('ai_insights')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenant.id)
          .eq('acknowledged', false),
        sb.from('blocked_access_attempts')
          .select('id, agent_name, domain, attempted_at, blocked_by')
          .eq('tenant_id', tenant.id)
          .gte('attempted_at', sevenDaysAgo)
          .order('attempted_at', { ascending: false })
          .limit(50),
      ]);

      const allAlerts: Array<{ id: string; severity: string; message: string; alert_type: string; status: string; title: string; created_at: string }> = alertsRes.data || [];
      const unresolvedStatuses = ['active', 'open', 'pending'];
      const activeAlerts = allAlerts.filter(a => unresolvedStatuses.includes(a.status));
      const criticalAlerts = activeAlerts.filter(a => a.severity === 'critical' || a.severity === 'high');

      const vulnTotal = vulnTotalRes.count || 0;
      const vulnCritical = vulnCriticalRes.count || 0;

      const evidenceSummary = (evidenceSummaryRes.data || {
        auto_repairs: 0, auto_recoveries: 0, policy_drifts: 0,
        critical_prevented: 0, high_prevented: 0, medium_prevented: 0, incidents_contained: 0
      }) as Record<string, number>;

      const autoRepairs = evidenceSummary.auto_repairs || 0;
      const autoRecoveries = evidenceSummary.auto_recoveries || 0;
      const policyDrifts = evidenceSummary.policy_drifts || 0;
      const criticalPrevented = evidenceSummary.critical_prevented || 0;
      const highPrevented = evidenceSummary.high_prevented || 0;
      const mediumPrevented = evidenceSummary.medium_prevented || 0;
      const incidentsContained = evidenceSummary.incidents_contained || 0;

      const blockedCount = blockedRes.count || 0;

      const breakdown: Record<string, number> = {
        autoRepairs: autoRepairs * COST_MODEL.auto_repair,
        autoRecoveries: autoRecoveries * COST_MODEL.auto_recovery,
        criticalPrevented: criticalPrevented * COST_MODEL.security_event_critical,
        highPrevented: highPrevented * COST_MODEL.security_event_high,
        policyCorrections: policyDrifts * COST_MODEL.policy_drift,
        blockedAccess: blockedCount * COST_MODEL.blocked_access
      };
      const totalCostAvoided = Object.values(breakdown).reduce((a, b) => a + b, 0);
      const hoursOfITSaved = (autoRepairs * 0.5) + (autoRecoveries * 1) + (policyDrifts * 0.25) + (criticalPrevented * 2);

      return {
        _raw: true as const,
        alerts: {
          total: allAlerts.length,
          active: activeAlerts.length,
          critical: criticalAlerts.length,
          items: activeAlerts
        },
        blocked: {
          last7d: blockedCount,
          items: (blockedItemsRes.data || []) as Array<{ id: string; agent_name: string; domain: string; attempted_at: string; blocked_by: string }>
        },
        evidence: {
          last7d: [],
          last30d: [],
          incidentsContained,
          autoRepairs,
          autoRecoveries,
          policyDrifts,
          criticalPrevented,
          highPrevented,
          mediumPrevented
        },
        vulnerabilities: {
          total: vulnTotal,
          critical: vulnCritical
        },
        insights: {
          pending: insightsRes.count || 0
        },
        financial: {
          totalCostAvoided,
          hoursOfITSaved,
          breakdown
        },
        lastUpdate: new Date()
      };
    },
    enabled: !tenantLoading && !!tenant?.id,
    staleTime: 120_000,
    realtimeTable: 'system_alerts',
    realtimeFilter: tenant?.id ? `tenant_id=eq.${tenant.id}` : undefined,
  });

  // PERF-FIX: Memoize agent-dependent computed values to prevent re-render cascade
  const agents = useMemo(() => {
    const protectedOnline = agentCounts.online + agentCounts.warning;

    return {
      total: agentCounts.total,
      online: protectedOnline,
      offline: agentCounts.offline,
      warning: agentCounts.warning,
      neverConnected: agentCounts.never_connected,
      protectionPercent: agentCounts.total > 0 ? Math.round((protectedOnline / agentCounts.total) * 100) : 0
    };
  }, [agentCounts]);

  // PERF-FIX: Memoize security score
  const securityScore = useMemo(() => {
    let score = 100;
    score -= Math.min(agents.offline * 5, 25);
    score -= Math.min((data?.alerts.critical || 0) * 10, 30);
    score -= Math.min((data?.vulnerabilities.critical || 0) * 5, 25);
    return Math.max(0, score);
  }, [agents.offline, data?.alerts.critical, data?.vulnerabilities.critical]);

  // PERF-FIX: Memoize global status
  const globalStatus = useMemo(() => {
    if (securityScore >= 80 && (data?.alerts.critical || 0) === 0) {
      return { emoji: '🟢', title: 'Tudo sob controle', description: 'Todos os computadores estão protegidos.', variant: 'success' as const };
    }
    if (securityScore >= 60 || (data?.alerts.critical || 0) <= 2) {
      return { emoji: '🟡', title: 'Atenção necessária', description: 'Alguns itens precisam de verificação.', variant: 'warning' as const };
    }
    return { emoji: '🔴', title: 'Ação urgente', description: 'Há riscos que podem afetar seu negócio.', variant: 'danger' as const };
  }, [securityScore, data?.alerts.critical]);

  const metrics: UnifiedMetrics | null = data ? {
    agents,
    alerts: data.alerts,
    blocked: data.blocked,
    evidence: data.evidence,
    vulnerabilities: data.vulnerabilities,
    insights: data.insights,
    securityScore,
    globalStatus,
    financial: data.financial,
    lastUpdate: data.lastUpdate
  } : null;

  return {
    metrics,
    isLoading: isLoading || snapshotsLoading || tenantLoading,
    isFetched,
    refetch,
    tenant
  };
}
