import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from './useTenant';
import type { Json } from '@/integrations/supabase/types';

export interface ActionHistoryItem {
  id: string;
  tenant_id: string;
  agent_id: string | null;
  insight_type: string;
  severity: string;
  title: string;
  description: string | null;
  status: string;
  resolved_at: string | null;
  resolved_by: string | null;
  auto_action_executed: boolean;
  auto_action_executed_at: string | null;
  created_at: string;
  evidence: Json | null;
  recommendation: string | null;
  agent?: {
    agent_name: string;
    hostname: string | null;
  } | null;
}

export function useActionCenterHistory(limit = 50) {
  const { tenant } = useTenant();

  return useQuery({
    queryKey: ['action-center-history', tenant?.id, limit],
    queryFn: async (): Promise<ActionHistoryItem[]> => {
      const { data, error } = await supabase
        .from('ai_insights')
        .select(`
          id,
          tenant_id,
          agent_id,
          insight_type,
          severity,
          title,
          description,
          status,
          resolved_at,
          resolved_by,
          auto_action_executed,
          auto_action_executed_at,
          created_at,
          evidence,
          recommendation,
          agents:agent_id (
            agent_name,
            hostname
          )
        `)
        .eq('tenant_id', tenant!.id)
        .in('status', ['resolved', 'ignored'])
        .order('resolved_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      
      return (data || []).map(item => ({
        ...item,
        agent: item.agents as ActionHistoryItem['agent']
      }));
    },
    enabled: !!tenant?.id,
    staleTime: 30000,
  });
}

export function useActionCenterHistoryCount() {
  const { data } = useActionCenterHistory();
  
  return {
    resolvedCount: data?.filter(i => i.status === 'resolved').length || 0,
    ignoredCount: data?.filter(i => i.status === 'ignored').length || 0,
    totalCount: data?.length || 0,
  };
}
