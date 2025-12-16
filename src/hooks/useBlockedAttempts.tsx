import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface BlockedAttempt {
  id: string;
  tenant_id: string;
  agent_id: string;
  agent_name: string;
  domain: string;
  policy_id: string | null;
  attempted_at: string;
  blocked_by: string;
  user_name: string | null;
  source: string | null;
  created_at: string;
}

interface UseBlockedAttemptsOptions {
  agentId?: string;
  limit?: number;
}

export function useBlockedAttempts(options: UseBlockedAttemptsOptions = {}) {
  const { agentId, limit = 100 } = options;

  const { data: attempts, isLoading, error, refetch } = useQuery({
    queryKey: ['blocked-attempts', agentId, limit],
    queryFn: async (): Promise<BlockedAttempt[]> => {
      // Use any cast since blocked_access_attempts is a new table
      let query = (supabase as any)
        .from('blocked_access_attempts')
        .select('*')
        .order('attempted_at', { ascending: false })
        .limit(limit);

      if (agentId) {
        query = query.eq('agent_id', agentId);
      }

      const { data, error } = await query;

      if (error) {
        console.error('[useBlockedAttempts] Error fetching attempts:', error);
        throw error;
      }

      return (data || []) as BlockedAttempt[];
    },
    staleTime: 30 * 1000, // 30 seconds
  });

  // Stats for today
  const todayStats = {
    totalAttempts: 0,
    uniqueDomains: 0,
    uniqueAgents: 0,
  };

  if (attempts && attempts.length > 0) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayAttempts = attempts.filter(a => new Date(a.attempted_at) >= today);
    todayStats.totalAttempts = todayAttempts.length;
    todayStats.uniqueDomains = new Set(todayAttempts.map(a => a.domain)).size;
    todayStats.uniqueAgents = new Set(todayAttempts.map(a => a.agent_id)).size;
  }

  return {
    attempts: attempts || [],
    isLoading,
    error,
    refetch,
    todayStats,
  };
}
