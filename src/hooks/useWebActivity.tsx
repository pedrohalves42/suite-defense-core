import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { WebActivityItem } from '@/types/security';
import { useActiveTenant } from './useActiveTenant';
import { logger } from '@/lib/logger';
// Removed unused import: tenantQuery

interface WebActivityRow {
  domain: string;
  visited_at: string;
  category?: string | null;
  is_blocked?: boolean | null;
}

async function fetchWebActivity(agentId: string, tenantId: string): Promise<WebActivityItem[]> {
  // Fetch raw data and aggregate manually - expanded to 7 days for better visibility
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  
  logger.debug('[useWebActivity] Starting fetch:', { agentId, tenantId, since: sevenDaysAgo });
  
  // ADR-026 FIX: Use direct supabase query to avoid RLS issues with JWT sync delay
  // The RLS policy tenant_web_activity_select uses user_roles subquery which should work
  const { data, error } = await supabase
    .from('agent_web_activity')
    .select('domain, visited_at, category, is_blocked, visit_count')
    .eq('agent_id', agentId)
    .eq('tenant_id', tenantId)
    .gte('visited_at', sevenDaysAgo)
    .order('visited_at', { ascending: false })
    .limit(5000);

  if (error) {
    console.error('[useWebActivity] Error fetching activity:', error);
    throw new Error(`Failed to fetch web activity: ${error.message}`);
  }

  console.log('[useWebActivity] Fetched rows:', data?.length || 0, 'for agent:', agentId);
  const rows = (data || []) as WebActivityRow[];

  // Aggregate by domain
  const aggregated = new Map<string, { 
    first: string; 
    last: string; 
    count: number; 
    category?: string;
    is_blocked?: boolean;
  }>();
  
  for (const item of rows) {
    const existing = aggregated.get(item.domain);
    if (existing) {
      if (item.visited_at < existing.first) {
        existing.first = item.visited_at;
      }
      if (item.visited_at > existing.last) {
        existing.last = item.visited_at;
      }
      // Usar visit_count do agente se disponível, senão incrementar 1
      existing.count += (item as any).visit_count || 1;
      // Keep latest category/is_blocked values
      if (item.category) existing.category = item.category;
      if (item.is_blocked !== null) existing.is_blocked = item.is_blocked ?? undefined;
    } else {
      aggregated.set(item.domain, {
        first: item.visited_at,
        last: item.visited_at,
        count: 1,
        category: item.category ?? undefined,
        is_blocked: item.is_blocked ?? undefined
      });
    }
  }

  const result: WebActivityItem[] = Array.from(aggregated.entries()).map(([domain, data]) => ({
    domain,
    first_seen_at: data.first,
    last_seen_at: data.last,
    hits: data.count,
    category: data.category,
    is_blocked: data.is_blocked
  }));

  // Sort by last seen (most recent first)
  result.sort((a, b) => new Date(b.last_seen_at).getTime() - new Date(a.last_seen_at).getTime());

  return result;
}

export function useWebActivity(agentId: string, enabled = true) {
  const { activeTenant, loading } = useActiveTenant();
  
  return useQuery({
    queryKey: ['web-activity', activeTenant?.id, agentId],
    queryFn: () => fetchWebActivity(agentId, activeTenant!.id),
    enabled: enabled && !!agentId && !loading && !!activeTenant?.id,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
