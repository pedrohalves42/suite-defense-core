import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { AgentTimelineEvent } from '@/types/security';

async function fetchAgentTimeline(agentId: string): Promise<AgentTimelineEvent[]> {
  const { data, error } = await supabase
    .from('agent_timeline_events')
    .select('*')
    .eq('agent_id', agentId)
    .order('event_time', { ascending: false })
    .limit(200);

  if (error) {
    throw new Error(`Failed to fetch agent timeline: ${error.message}`);
  }

  return data || [];
}

export function useAgentTimeline(agentId: string, enabled = true) {
  return useQuery({
    queryKey: ['agent-timeline', agentId],
    queryFn: () => fetchAgentTimeline(agentId),
    enabled: enabled && !!agentId,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}
