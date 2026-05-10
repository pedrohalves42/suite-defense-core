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
  final_outcome: string | null;
  agent?: {
    agent_name: string;
    hostname: string | null;
  } | null;
  ai_actions?: Array<{
    id: string;
    action_type: string;
    effectiveness_status: string | null;
    effectiveness_checked_at: string | null;
    effectiveness_evidence: Json | null;
  }> | null;
}

export function useActionCenterHistory(limit = 50) {
  // V-FIX: Use loading guard to prevent race condition during tenant sync
  const { tenant, loading: tenantLoading } = useTenant();

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
          final_outcome,
          agents:agent_id (
            agent_name,
            hostname
          ),
          ai_actions (
            id,
            action_type,
            effectiveness_status,
            effectiveness_checked_at,
            effectiveness_evidence
          )
        `)
        .eq('tenant_id', tenant!.id)
        .in('status', ['resolved', 'ignored'])
        .order('resolved_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      
      return (data || []).map(item => ({
        ...item,
        agent: item.agents as ActionHistoryItem['agent'],
        ai_actions: item.ai_actions as ActionHistoryItem['ai_actions']
      }));
    },
    // V-FIX: Guard with !tenantLoading to prevent queries before JWT sync completes
    enabled: !tenantLoading && !!tenant?.id,
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

export function useActionCenterEffectivenessStats() {
  const { data } = useActionCenterHistory();
  
  if (!data) return null;
  
  const actionsWithEffectiveness = data.filter(
    i => i.ai_actions && i.ai_actions.length > 0
  );
  
  const resolvedCount = actionsWithEffectiveness.filter(
    i => i.ai_actions?.some(a => a.effectiveness_status === 'resolved' || a.effectiveness_status === 'success')
  ).length;
  
  const partialCount = actionsWithEffectiveness.filter(
    i => i.ai_actions?.some(a => a.effectiveness_status === 'partial')
  ).length;
  
  const failedCount = actionsWithEffectiveness.filter(
    i => i.ai_actions?.some(a => a.effectiveness_status === 'failed')
  ).length;
  
  const pendingCount = actionsWithEffectiveness.filter(
    i => i.ai_actions?.some(a => a.effectiveness_status === 'pending')
  ).length;
  
  const total = actionsWithEffectiveness.length;
  const successRate = total > 0 ? Math.round((resolvedCount / total) * 100) : 0;
  
  return {
    resolvedCount,
    partialCount,
    failedCount,
    pendingCount,
    total,
    successRate
  };
}
