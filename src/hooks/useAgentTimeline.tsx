import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActiveTenant } from '@/hooks/useActiveTenant';
import type { AgentTimelineEvent } from '@/types/security';

async function fetchAgentTimeline(agentId: string, tenantId: string): Promise<AgentTimelineEvent[]> {
  const { data, error } = await supabase
    .from('agent_timeline_events')
    .select('*')
    .eq('agent_id', agentId)
    .eq('tenant_id', tenantId) // ADR-030 CRIT-03: Explicit tenant filter
    .order('event_time', { ascending: false })
    .limit(200);

  if (error) {
    throw new Error(`Failed to fetch agent timeline: ${error.message}`);
  }

  return data || [];
}

export function useAgentTimeline(agentId: string, enabled = true) {
  const { activeTenant, loading } = useActiveTenant();
  
  return useQuery({
    queryKey: ['agent-timeline', activeTenant?.id, agentId],
    queryFn: () => fetchAgentTimeline(agentId, activeTenant!.id),
    // ADR-030 CRIT-03: All guards must pass before query executes
    enabled: enabled && !!agentId && !loading && !!activeTenant?.id,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}
