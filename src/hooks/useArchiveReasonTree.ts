import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ArchiveReason {
  agent_id: string;
  reason_type: string;
  reason: string;
  actor_type: string;
  actor_id: string | null;
  notes: string | null;
  archived_at: string;
  agent_name: string | null;
  hostname: string | null;
  tenant_id: string;
}

export function useArchiveReasonTree(agentId: string | null) {
  return useQuery({
    queryKey: ['archive-reason-tree', agentId],
    queryFn: async (): Promise<ArchiveReason | null> => {
      const { data, error } = await supabase
        .from('v_agent_archive_reason_tree')
        .select('agent_id, agent_name, archived_at, reason, actor_type, actor_id, notes, reactivated_at, reactivation_reason')
        .eq('agent_id', agentId!)
        .order('archived_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data as unknown as ArchiveReason | null;
    },
    enabled: !!agentId,
    staleTime: 60000,
  });
}
