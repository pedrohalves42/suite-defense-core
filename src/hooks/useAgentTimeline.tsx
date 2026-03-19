import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActiveTenant } from '@/hooks/useActiveTenant';
import type { AgentTimelineEvent } from '@/types/security';

async function fetchAgentTimeline(agentId: string, tenantId: string): Promise<AgentTimelineEvent[]> {
  const { data, error } = await supabase
    .from('agent_evidence_logs')
    .select('tenant_id, agent_id, id, event_type, evidence_hash, created_at, event_data')
    .eq('agent_id', agentId)
    .eq('tenant_id', tenantId) // ADR-030 CRIT-03: Explicit tenant filter
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    throw new Error(`Failed to fetch agent timeline: ${error.message}`);
  }

  // Map evidence logs to timeline event format, filtering out empty security events
  return (data || [])
    .filter((row) => {
      // Skip security_event entries with empty event_data (ghost events without useful info)
      if (row.event_type === 'security_event') {
        const d = row.event_data as Record<string, unknown> | null;
        if (!d || Object.keys(d).length === 0) return false;
      }
      return true;
    })
    .map((row) => ({
      tenant_id: row.tenant_id,
      agent_id: row.agent_id ?? '',
      source_id: row.id,
      event_type: row.event_type,
      event_key: row.evidence_hash,
      event_time: row.created_at,
      data: row.event_data,
    }));
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
