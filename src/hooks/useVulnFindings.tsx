import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { VulnFinding } from '@/types/security';

async function fetchVulnFindings(agentId: string): Promise<VulnFinding[]> {
  const { data, error } = await supabase
    .from('vuln_findings')
    .select('*')
    .eq('agent_id', agentId)
    .order('severity', { ascending: false })
    .order('first_seen_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch vulnerability findings: ${error.message}`);
  }

  return data || [];
}

export function useVulnFindings(agentId: string, enabled = true) {
  return useQuery({
    queryKey: ['vuln-findings', agentId],
    queryFn: () => fetchVulnFindings(agentId),
    enabled: enabled && !!agentId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
