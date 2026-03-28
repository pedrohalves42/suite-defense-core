import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';

import type { Json } from '@/integrations/supabase/types';
import { useAdaptivePolling } from '@/hooks/useAdaptivePolling';

export interface DecisionEvent {
  id: string;
  tenant_id: string;
  rule_code: string;
  agent_id: string | null;
  agent_name: string | null;
  action: string;
  evidence: Json;
  actions_executed: Json;
  decision_source?: string | null;
  decision_type?: string | null;
  created_at: string;
}

interface UseDecisionEventsOptions {
  ruleCode?: string;
  agentId?: string;
  limit?: number;
}

export function useDecisionEvents(options: UseDecisionEventsOptions = {}) {
  const adaptiveInterval = useAdaptivePolling(300000);
  const { tenant } = useTenant();
  const { ruleCode, agentId, limit = 100 } = options;

  return useQuery({
    queryKey: ['decision-events', tenant?.id, ruleCode, agentId, limit],
    queryFn: async () => {
      let query = supabase
        .from('decision_events')
        .select('id, tenant_id, rule_code, agent_id, agent_name, action, decision_source, decision_type, created_at')
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
    refetchInterval: adaptiveInterval
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useDecisionEventDetail(eventId: string | null) {
  const { tenant } = useTenant();
  return useQuery({
    queryKey: ['decision-event-detail', eventId, tenant?.id],
    queryFn: async () => {
      if (!eventId || !tenant?.id) return null;

      // V-1037 FIX: Add tenant_id filter
      const { data, error } = await supabase
        .from('decision_events')
        .select('id, tenant_id, rule_code, agent_id, agent_name, action, evidence, actions_executed, decision_source, decision_type, created_at')
        .eq('id', eventId)
        .eq('tenant_id', tenant.id)
        .maybeSingle();

      if (error) throw error;
      return data as DecisionEvent | null;
    },
    enabled: !!eventId && !!tenant?.id
  });
}

export function useDecisionRules() {
  return useQuery({
    queryKey: ['decision-rules'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('decision_rules')
        .select('id, code, description, scope, definition, auto_execute, is_enabled, created_at, updated_at')
        .order('code');

      if (error) throw error;
      return data;
    }
  });
}
