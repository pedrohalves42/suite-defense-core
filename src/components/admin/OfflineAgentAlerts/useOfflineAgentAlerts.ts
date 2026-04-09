import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { RpcAgentRow } from '@/types/rpc';
import { useTenant } from '@/hooks/useTenant';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { DEFAULT_BUSINESS_HOURS } from './constants';
import { isWithinBusinessHours } from './utils';
import type { BusinessHours, OfflineAgent } from './types';

export function useOfflineAgentAlerts() {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const [acknowledgedAgents, setAcknowledgedAgents] = useState<Set<string>>(new Set());
  const [showAcknowledged, setShowAcknowledged] = useState(false);

  const { data: businessHours = DEFAULT_BUSINESS_HOURS } = useQuery({
    queryKey: ['tenant-business-hours', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return DEFAULT_BUSINESS_HOURS;
      const { data, error } = await supabase
        .from('tenant_settings')
        .select('business_hours')
        .eq('tenant_id', tenant.id)
        .maybeSingle();
      if (error || !data?.business_hours) return DEFAULT_BUSINESS_HOURS;
      const bh = data.business_hours as unknown as BusinessHours;
      if (bh && typeof bh.enabled === 'boolean' && Array.isArray(bh.days)) return bh;
      return DEFAULT_BUSINESS_HOURS;
    },
    enabled: !!tenant?.id,
    staleTime: 5 * 60 * 1000,
  });

  const isBusinessHoursActive = useMemo(() => isWithinBusinessHours(businessHours), [businessHours]);

  const { data: offlineAgents = [], isLoading } = useQuery({
    queryKey: ['offline-agents-alerts', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data: agentsRaw, error } = await supabase.rpc('get_agents_list', {
        p_tenant_id: tenant.id,
        p_include_archived: false,
      });
      if (error) throw error;

      return ((agentsRaw || []) as unknown as RpcAgentRow[])
        .filter((a) => a.status === 'active' && a.last_heartbeat && a.last_heartbeat < oneHourAgo)
        .map((a) => {
          const lastHeartbeat = new Date(a.last_heartbeat!);
          const offlineHours = (Date.now() - lastHeartbeat.getTime()) / (1000 * 60 * 60);
          return {
            agent_id: a.id,
            agent_name: a.agent_name,
            last_heartbeat: a.last_heartbeat!,
            offline_hours: Math.round(offlineHours * 10) / 10,
            hostname: a.hostname,
            os_type: a.os_type,
          } as OfflineAgent;
        })
        .sort((a, b) => a.last_heartbeat.localeCompare(b.last_heartbeat));
    },
    enabled: !!tenant?.id,
    refetchInterval: false,
    staleTime: 300_000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (!tenant?.id) return;
    const channel = supabase
      .channel('offline-alerts-realtime')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'agents',
        filter: `tenant_id=eq.${tenant.id}`,
      }, (payload) => {
        queryClient.invalidateQueries({ queryKey: ['offline-agents-alerts', tenant.id] });
        const newAgent = payload.new as { agent_name: string; last_heartbeat: string };
        const oldAgent = payload.old as { last_heartbeat: string };
        if (newAgent.last_heartbeat && newAgent.last_heartbeat !== oldAgent.last_heartbeat) {
          const minutesSinceHb = (Date.now() - new Date(newAgent.last_heartbeat).getTime()) / (1000 * 60);
          if (minutesSinceHb < 5) {
            toast.success(`✅ ${newAgent.agent_name} está online novamente!`, { duration: 5000 });
          }
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tenant?.id, queryClient]);

  const handleAcknowledge = (agentId: string, agentName: string) => {
    setAcknowledgedAgents((prev) => new Set([...prev, agentId]));
    toast.success(`Alerta de ${agentName} reconhecido`, { duration: 2000 });
  };

  const handleAcknowledgeAll = () => {
    const allIds = offlineAgents.map((a) => a.agent_id);
    setAcknowledgedAgents(new Set(allIds));
    toast.success(`${allIds.length} alertas reconhecidos`, { duration: 2000 });
  };

  const displayedAgents = showAcknowledged
    ? offlineAgents
    : offlineAgents.filter((a) => !acknowledgedAgents.has(a.agent_id));

  const unacknowledgedCount = offlineAgents.filter((a) => !acknowledgedAgents.has(a.agent_id)).length;

  return {
    offlineAgents,
    displayedAgents,
    isLoading,
    isBusinessHoursActive,
    businessHours,
    acknowledgedAgents,
    unacknowledgedCount,
    showAcknowledged,
    setShowAcknowledged,
    handleAcknowledge,
    handleAcknowledgeAll,
  };
}
