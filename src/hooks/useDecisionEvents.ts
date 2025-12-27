import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';

export interface DecisionEvent {
  id: string;
  tenant_id: string;
  rule_code: string;
  agent_id: string | null;
  agent_name: string | null;
  action: string;
  evidence: {
    error_signature?: string;
    failure_count?: number;
    time_window_minutes?: number;
    heartbeat_age_seconds?: number;
    agent_version?: string;
    detected_at?: string;
    // Throttle evidence
    request_count?: number;
    error_count?: number;
    error_rate?: number;
    new_poll_interval?: number;
    // Isolate evidence
    event_count?: number;
    event_types?: string[];
    // Version block evidence
    version?: string;
    platform?: string;
    total_agents?: number;
    failed_agents?: number;
    failure_rate?: number;
    // Improdutive agent evidence (AGENT_IMPRODUTIVE_005)
    health_status?: string;
    minutes_since_heartbeat?: number;
    minutes_since_execution?: number;
    stale_queued_jobs?: number;
    pending_jobs?: number;
    auto_revert_scheduled?: boolean;
    auto_revert_after_hours?: number;
    [key: string]: unknown;
  };
  actions_executed: Array<{
    type: string;
    success: boolean;
    id?: string;
    error?: string;
  }>;
  created_at: string;
}

interface UseDecisionEventsOptions {
  ruleCode?: string;
  agentId?: string;
  limit?: number;
}

export function useDecisionEvents(options: UseDecisionEventsOptions = {}) {
  const { tenant } = useTenant();
  const { ruleCode, agentId, limit = 100 } = options;

  return useQuery({
    queryKey: ['decision-events', tenant?.id, ruleCode, agentId, limit],
    queryFn: async () => {
      let query = supabase
        .from('decision_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (tenant?.id) {
        query = query.eq('tenant_id', tenant.id);
      }

      if (ruleCode) {
        query = query.eq('rule_code', ruleCode);
      }

      if (agentId) {
        query = query.eq('agent_id', agentId);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as DecisionEvent[];
    },
    enabled: !!tenant?.id,
    refetchInterval: 30000,
  });
}

export function useDecisionEventDetail(eventId: string | null) {
  return useQuery({
    queryKey: ['decision-event-detail', eventId],
    queryFn: async () => {
      if (!eventId) return null;

      const { data, error } = await supabase
        .from('decision_events')
        .select('*')
        .eq('id', eventId)
        .single();

      if (error) throw error;
      return data as DecisionEvent;
    },
    enabled: !!eventId,
  });
}

export function useDecisionRules() {
  return useQuery({
    queryKey: ['decision-rules'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('decision_rules')
        .select('*')
        .order('code');

      if (error) throw error;
      return data;
    },
  });
}
