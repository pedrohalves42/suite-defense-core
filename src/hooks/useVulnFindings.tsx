import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { VulnFinding } from '@/types/security';
import { useActiveTenant } from './useActiveTenant';
import { tenantQuery } from '@/lib/tenantQuery';

async function fetchVulnFindings(agentId: string, tenantId: string): Promise<VulnFinding[]> {
  const { data, error } = await tenantQuery('vuln_findings', tenantId)
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
  const { activeTenant, loading } = useActiveTenant();
  
  return useQuery({
    queryKey: ['vuln-findings', activeTenant?.id, agentId],
    queryFn: () => fetchVulnFindings(agentId, activeTenant!.id),
    enabled: enabled && !!agentId && !loading && !!activeTenant?.id,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
