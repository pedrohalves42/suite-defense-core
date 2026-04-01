import { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { toast } from 'sonner';

type StatusFilter = 'all' | 'problems' | 'protected' | 'offline';

export interface SelectedAgent {
  id: string;
  name: string;
  tenantId: string;
  isThrottled?: boolean | null;
  isIsolated?: boolean | null;
  isInSafeMode?: boolean | null;
}

export function useAgentHealthMonitor() {
  const { tenant, loading: tenantLoading } = useTenant();
  const [liveHeartbeats, setLiveHeartbeats] = useState<number>(0);
  const [recentHeartbeats, setRecentHeartbeats] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selectedAgent, setSelectedAgent] = useState<SelectedAgent | null>(null);
  const [selectedBatch, setSelectedBatch] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();

  const { data: agentsHealth = [], isLoading, isError, error: errorData, refetch } = useQuery({
    queryKey: ['agent-health', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const { data, error } = await supabase.rpc('get_agent_health_metrics', { p_tenant_id: tenant.id });
      if (error) throw error;
      return data;
    },
    enabled: !tenantLoading && !!tenant?.id,
    refetchInterval: false,
    staleTime: 600_000,
    refetchOnWindowFocus: false,
  });

  // Realtime heartbeats
  useEffect(() => {
    if (!tenant?.id) return;
    const channel = supabase
      .channel('agent-heartbeats')
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'agents', filter: `tenant_id=eq.${tenant.id}`
      }, (payload: { new: { agent_name: string } }) => {
        const agentName = payload.new.agent_name;
        setLiveHeartbeats(prev => prev + 1);
        setRecentHeartbeats(prev => [agentName, ...prev.slice(0, 4)]);
        queryClient.invalidateQueries({ queryKey: ['agent-health', tenant.id] });
        toast.success(`✓ ${agentName} conectado`, { duration: 2000 });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tenant?.id, queryClient]);

  const counts = useMemo(() => agentsHealth.reduce(
    (acc, agent) => {
      if (agent.health_status === 'healthy') acc.healthy++;
      if (agent.health_status === 'warning' || agent.health_status === 'critical') acc.critical++;
      if (agent.health_status === 'offline') acc.offline++;
      if (agent.health_status === 'never_connected') acc.never_connected++;
      if (agent.is_throttled || agent.is_isolated || agent.is_in_safe_mode) acc.withProblems++;
      if (agent.is_in_safe_mode) acc.protected++;
      return acc;
    },
    { healthy: 0, critical: 0, offline: 0, never_connected: 0, withProblems: 0, protected: 0 }
  ), [agentsHealth]);

  const totalAgents = agentsHealth.length || 0;
  const healthPercentage = totalAgents > 0 ? Math.round((counts.healthy / totalAgents) * 100) : 0;

  const filteredAgents = useMemo(() => {
    switch (statusFilter) {
      case 'problems': return agentsHealth.filter(a => a.is_throttled || a.is_isolated || a.is_in_safe_mode);
      case 'protected': return agentsHealth.filter(a => a.is_in_safe_mode);
      case 'offline': return agentsHealth.filter(a => a.health_status === 'offline' || a.health_status === 'never_connected');
      default: return agentsHealth;
    }
  }, [agentsHealth, statusFilter]);

  const agentIds = useMemo(() =>
    filteredAgents.map(a => a.id).filter((id): id is string => !!id),
    [filteredAgents]
  );

  return {
    tenant, tenantLoading, isLoading, isError, errorData, refetch,
    agentsHealth, filteredAgents, agentIds,
    counts, totalAgents, healthPercentage,
    statusFilter, setStatusFilter,
    selectedAgent, setSelectedAgent,
    selectedBatch, setSelectedBatch,
    liveHeartbeats, recentHeartbeats,
  };
}
