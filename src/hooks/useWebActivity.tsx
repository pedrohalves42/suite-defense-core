import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { WebActivityItem } from '@/types/security';

async function fetchWebActivity(agentId: string): Promise<WebActivityItem[]> {
  // Fetch raw data and aggregate manually
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  
  const { data, error } = await supabase
    .from('agent_web_activity')
    .select('domain, visited_at, category, is_blocked')
    .eq('agent_id', agentId)
    .gte('visited_at', oneDayAgo)
    .order('visited_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch web activity: ${error.message}`);
  }

  // Aggregate by domain
  const aggregated = new Map<string, { 
    first: string; 
    last: string; 
    count: number; 
    category?: string;
    is_blocked?: boolean;
  }>();
  
  for (const item of data || []) {
    const existing = aggregated.get(item.domain);
    if (existing) {
      if (item.visited_at < existing.first) {
        existing.first = item.visited_at;
      }
      if (item.visited_at > existing.last) {
        existing.last = item.visited_at;
      }
      existing.count++;
      // Keep latest category/is_blocked values
      if (item.category) existing.category = item.category;
      if (item.is_blocked !== null) existing.is_blocked = item.is_blocked;
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
  return useQuery({
    queryKey: ['web-activity', agentId],
    queryFn: () => fetchWebActivity(agentId),
    enabled: enabled && !!agentId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
