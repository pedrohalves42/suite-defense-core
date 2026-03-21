import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActiveTenant } from '@/hooks/useActiveTenant';
import type { SoftwareItem } from '@/types/security';

/**
 * Hook to fetch software inventory for an agent with proper tenant isolation.
 * ADR-030 CRIT-03: Refactored to include explicit tenant_id filtering
 * and proper loading guards to prevent cross-tenant data leakage.
 */
export function useSoftwareInventory(agentId: string, enabled = true) {
  const { activeTenant, loading } = useActiveTenant();

  return useQuery({
    queryKey: ['software-inventory', activeTenant?.id, agentId],
    queryFn: async (): Promise<SoftwareItem[]> => {
      if (!activeTenant?.id) return [];

      const { data, error } = await supabase
        .from('software_inventory')
        .select('id, agent_id, tenant_id, name, version, vendor, install_location, risk_level, first_seen_at, last_seen_at')
        .eq('agent_id', agentId)
        .eq('tenant_id', activeTenant.id) // ADR-030 CRIT-03: Explicit tenant filter
        .order('name', { ascending: true });

      if (error) {
        throw new Error(`Failed to fetch software inventory: ${error.message}`);
      }

      return data || [];
    },
    // ADR-030 CRIT-03: All guards must pass before query executes
    enabled: enabled && !!agentId && !loading && !!activeTenant?.id,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
