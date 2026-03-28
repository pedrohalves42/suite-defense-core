import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from './useTenant';
import { useAdaptivePolling } from '@/hooks/useAdaptivePolling';

interface AutonomyMetrics {
  total_decisions: number;
  total_actions_created: number;
  actions_auto_executed: number;
  actions_pending: number;
  actions_approved: number;
  actions_rejected: number;
  alerts_generated: number;
  decisions_by_rule: Array<{ rule_code: string; count: number }>;
  actions_by_type: Array<{ action_type: string; count: number }>;
  execution_success_rate: number;
  job_success_rate_corrected: number;
}

interface AuditTrailIntegrity {
  orphan_actions: Array<{ id: string; action_type: string; created_at: string }>;
  orphan_actions_count: number;
  executions_without_audit: number;
  decisions_without_insight: number;
  integrity_score: number;
}

interface DecisionTimelineItem {
  id: string;
  rule_code: string;
  action: string;
  evidence: Record<string, unknown>;
  executed_actions: string[];
  created_at: string;
  agent_id: string | null;
  agent_name: string | null;
  rule_name: string | null;
  rule_severity: string | null;
  risk_level: string | null;
  related_actions: Array<{
    id: string;
    action_type: string;
    status: string;
    executed_at: string | null;
  }> | null;
}

export const useAutonomyMetrics = (days: number = 7) => {
  const adaptiveInterval = useAdaptivePolling(300000);
  const { tenant } = useTenant();

  return useQuery({
    queryKey: ['autonomy-metrics', tenant?.id, days],
    queryFn: async () => {
      if (!tenant?.id) return null;

      const { data, error } = await supabase.rpc('get_autonomy_metrics', {
        p_tenant_id: tenant.id,
        p_days: days
      });

      if (error) throw error;
      return data as any as AutonomyMetrics;
    },
    enabled: !!tenant?.id,
    refetchInterval: adaptiveInterval
  });
};

export const useAuditTrailIntegrity = () => {
  const { tenant } = useTenant();

  return useQuery({
    queryKey: ['audit-trail-integrity', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return null;

      const { data, error } = await supabase.rpc('validate_audit_trail_integrity', {
        p_tenant_id: tenant.id
      });

      if (error) throw error;
      return data as any as AuditTrailIntegrity;
    },
    enabled: !!tenant?.id,
    refetchInterval: adaptiveInterval
  });
};

export const useDecisionTimeline = (options?: { limit?: number; ruleCode?: string; agentId?: string }) => {
  const { tenant } = useTenant();

  return useQuery({
    queryKey: ['decision-timeline', tenant?.id, options?.limit, options?.ruleCode, options?.agentId],
    queryFn: async () => {
      if (!tenant?.id) return [];

      const { data, error } = await supabase.rpc('get_decision_timeline', {
        p_tenant_id: tenant.id,
        p_limit: options?.limit ?? 50,
        p_rule_code: options?.ruleCode ?? null,
        p_agent_id: options?.agentId ?? null
      });

      if (error) throw error;
      return (data || []) as any as DecisionTimelineItem[];
    },
    enabled: !!tenant?.id,
    refetchInterval: adaptiveInterval
  });
};

interface DecisionRule {
  id: string;
  code: string;
  description: string | null;
  is_enabled: boolean;
  scope: string | null;
  definition: Record<string, unknown> | null;
  created_at: string;
}

export const useActiveRules = () => {
  const { tenant } = useTenant();

  return useQuery({
    queryKey: ['active-rules', tenant?.id],
    queryFn: async (): Promise<DecisionRule[]> => {
      if (!tenant?.id) return [];

      const { data, error } = await supabase
        .from('decision_rules')
        .select('id, code, description, is_enabled, scope, definition, created_at')
        .eq('is_enabled', true)
        .order('code');

      if (error) throw error;
      return (data || []) as DecisionRule[];
    },
    enabled: !!tenant?.id
  });
};
