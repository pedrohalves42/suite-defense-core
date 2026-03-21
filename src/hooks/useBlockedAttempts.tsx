import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActiveTenant } from './useActiveTenant';
import { logger } from '@/lib/logger';

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

interface BlockedAttemptsStats {
  totalAttempts: number;
  uniqueDomains: number;
  uniqueAgents: number;
  todayAttempts: number;
  weekAttempts: number;
  topBlockedDomains: { domain: string; count: number }[];
  attemptsByHour: { hour: number; count: number }[];
  agentBreakdown: { agentId: string; agentName: string; count: number }[];
}

export function useBlockedAttempts(options: UseBlockedAttemptsOptions = {}) {
  const { agentId, limit = 100 } = options;
  const { activeTenant, loading: tenantLoading } = useActiveTenant();

  const { data: attempts, isLoading, error, refetch } = useQuery({
    queryKey: ['blocked-attempts', activeTenant?.id, agentId, limit],
    queryFn: async (): Promise<BlockedAttempt[]> => {
      let query = (supabase as any)
        .from('blocked_access_attempts')
        .select('id, tenant_id, agent_id, agent_name, domain, policy_id, attempted_at, blocked_by, user_name, source, created_at')
        .eq('tenant_id', activeTenant!.id) // P0 CRIT-02: Explicit tenant filter
        .order('attempted_at', { ascending: false })
        .limit(limit);

      if (agentId) {
        query = query.eq('agent_id', agentId);
      }

      const { data, error } = await query;

      if (error) {
        logger.error('[useBlockedAttempts] Error fetching attempts:', error);
        throw error;
      }

      return (data || []) as BlockedAttempt[];
    },
    staleTime: 30 * 1000,
    enabled: !tenantLoading && !!activeTenant?.id, // P0 CRIT-02: Race condition fix
  });

  // Enhanced stats calculation
  const stats: BlockedAttemptsStats = {
    totalAttempts: 0,
    uniqueDomains: 0,
    uniqueAgents: 0,
    todayAttempts: 0,
    weekAttempts: 0,
    topBlockedDomains: [],
    attemptsByHour: [],
    agentBreakdown: [],
  };

  const todayStats = {
    totalAttempts: 0,
    uniqueDomains: 0,
    uniqueAgents: 0,
  };

  if (attempts && attempts.length > 0) {
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    
    const todayAttempts = attempts.filter(a => new Date(a.attempted_at) >= today);
    const weekAttempts = attempts.filter(a => new Date(a.attempted_at) >= weekAgo);
    
    // Basic stats
    stats.totalAttempts = attempts.length;
    stats.uniqueDomains = new Set(attempts.map(a => a.domain)).size;
    stats.uniqueAgents = new Set(attempts.map(a => a.agent_id)).size;
    stats.todayAttempts = todayAttempts.length;
    stats.weekAttempts = weekAttempts.length;
    
    // Today stats (for backward compatibility)
    todayStats.totalAttempts = todayAttempts.length;
    todayStats.uniqueDomains = new Set(todayAttempts.map(a => a.domain)).size;
    todayStats.uniqueAgents = new Set(todayAttempts.map(a => a.agent_id)).size;
    
    // Top blocked domains
    const domainCounts = new Map<string, number>();
    for (const attempt of attempts) {
      domainCounts.set(attempt.domain, (domainCounts.get(attempt.domain) || 0) + 1);
    }
    stats.topBlockedDomains = Array.from(domainCounts.entries())
      .map(([domain, count]) => ({ domain, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    
    // Attempts by hour (last 24 hours)
    const hourCounts = new Map<number, number>();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    for (const attempt of attempts) {
      const attemptDate = new Date(attempt.attempted_at);
      if (attemptDate >= last24h) {
        const hour = attemptDate.getHours();
        hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
      }
    }
    stats.attemptsByHour = Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      count: hourCounts.get(i) || 0,
    }));
    
    // Agent breakdown
    const agentCounts = new Map<string, { agentId: string; agentName: string; count: number }>();
    for (const attempt of attempts) {
      const existing = agentCounts.get(attempt.agent_id);
      if (existing) {
        existing.count++;
      } else {
        agentCounts.set(attempt.agent_id, {
          agentId: attempt.agent_id,
          agentName: attempt.agent_name,
          count: 1,
        });
      }
    }
    stats.agentBreakdown = Array.from(agentCounts.values())
      .sort((a, b) => b.count - a.count);
  }

  return {
    attempts: attempts || [],
    isLoading,
    error,
    refetch,
    todayStats,
    stats,
  };
}
