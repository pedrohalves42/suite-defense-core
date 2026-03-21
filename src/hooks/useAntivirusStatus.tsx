import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { AntivirusStatus } from '@/types/security';

async function fetchAntivirusStatus(agentId: string): Promise<AntivirusStatus[]> {
  const { data, error } = await supabase
    .from('antivirus_status')
    .select('id, agent_id, tenant_id, engine_name, engine_version, status, threats_found, last_scan_at, last_update_at, collected_at')
    .eq('agent_id', agentId)
    .order('collected_at', { ascending: false })
    .limit(10);

  if (error) {
    throw new Error(`Failed to fetch antivirus status: ${error.message}`);
  }

  return data || [];
}

export function useAntivirusStatus(agentId: string, enabled = true) {
  return useQuery({
    queryKey: ['antivirus-status', agentId],
    queryFn: () => fetchAntivirusStatus(agentId),
    enabled: enabled && !!agentId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
