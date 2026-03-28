import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
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
      let query = (supabase )
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

  // TUNING: Memoize stats calculation to avoid recomputing on every render
  const { stats, todayStats } = useMemo(() => {
    const s: BlockedAttemptsStats = {
      totalAttempts: 0,
      uniqueDomains: 0,
      uniqueAgents: 0,
      todayAttempts: 0,
      weekAttempts: 0,
      topBlockedDomains: [],
      attemptsByHour: [],
      agentBreakdown: [],
    };

    const ts = {
      totalAttempts: 0,
      uniqueDomains: 0,
      uniqueAgents: 0,
    };

    if (!attempts || attempts.length === 0) return { stats: s, todayStats: ts };

    const now = Date.now();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayMs = todayStart.getTime();
    const weekMs = now - 7 * 24 * 60 * 60 * 1000;
    const last24hMs = now - 24 * 60 * 60 * 1000;

    // Single-pass aggregation
    const domainCounts = new Map<string, number>();
    const agentCounts = new Map<string, { agentId: string; agentName: string; count: number }>();
    const hourCounts = new Map<number, number>();
    const uniqueDomains = new Set<string>();
    const uniqueAgents = new Set<string>();
    const todayDomains = new Set<string>();
    const todayAgents = new Set<string>();
    let todayCount = 0;
    let weekCount = 0;

    for (const a of attempts) {
      const attemptMs = new Date(a.attempted_at).getTime();

      // Domain and agent tracking
      uniqueDomains.add(a.domain);
      uniqueAgents.add(a.agent_id);
      domainCounts.set(a.domain, (domainCounts.get(a.domain) || 0) + 1);

      const existing = agentCounts.get(a.agent_id);
      if (existing) existing.count++;
      else agentCounts.set(a.agent_id, { agentId: a.agent_id, agentName: a.agent_name, count: 1 });

      // Time-based stats
      if (attemptMs >= todayMs) {
        todayCount++;
        todayDomains.add(a.domain);
        todayAgents.add(a.agent_id);
      }
      if (attemptMs >= weekMs) weekCount++;
      if (attemptMs >= last24hMs) {
        const hour = new Date(a.attempted_at).getHours();
        hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
      }
    }

    s.totalAttempts = attempts.length;
    s.uniqueDomains = uniqueDomains.size;
    s.uniqueAgents = uniqueAgents.size;
    s.todayAttempts = todayCount;
    s.weekAttempts = weekCount;

    s.topBlockedDomains = Array.from(domainCounts.entries())
      .map(([domain, count]) => ({ domain, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    s.attemptsByHour = Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      count: hourCounts.get(i) || 0,
    }));

    s.agentBreakdown = Array.from(agentCounts.values())
      .sort((a, b) => b.count - a.count);

    ts.totalAttempts = todayCount;
    ts.uniqueDomains = todayDomains.size;
    ts.uniqueAgents = todayAgents.size;

    return { stats: s, todayStats: ts };
  }, [attempts]);

  return {
    attempts: attempts || [],
    isLoading,
    error,
    refetch,
    todayStats,
    stats,
  };
}
