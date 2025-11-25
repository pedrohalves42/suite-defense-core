import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { SoftwareItem } from '@/types/security';

async function fetchSoftwareInventory(agentId: string): Promise<SoftwareItem[]> {
  const { data, error } = await supabase
    .from('software_inventory')
    .select('*')
    .eq('agent_id', agentId)
    .order('name', { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch software inventory: ${error.message}`);
  }

  return data || [];
}

export function useSoftwareInventory(agentId: string, enabled = true) {
  return useQuery({
    queryKey: ['software-inventory', agentId],
    queryFn: () => fetchSoftwareInventory(agentId),
    enabled: enabled && !!agentId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
