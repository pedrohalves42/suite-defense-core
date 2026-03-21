import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useTenant } from './useTenant';

export interface DNSFilterStatus {
  agentId: string;
  agentName: string;
  displayName: string | null;
  isOnline: boolean;
  lastHeartbeat: string | null;
  dnsFilterInstalled: boolean;
  dnsFilterVersion: string | null;
  lastBlockSyncAt: string | null;
  pendingSetup: boolean;
  pendingSync: boolean;
}

export interface DNSFilterStats {
  totalAgents: number;
  onlineAgents: number;
  installedCount: number;
  pendingInstallCount: number;
  syncedCount: number;
  pendingSyncCount: number;
}

export interface DNSFilterJob {
  type: 'setup_dns_filter' | 'sync_blocked_websites' | 'collect_dns_blocks';
  agentId?: string;
  agentIds?: string[];
}

export function useDNSFilter() {
  const queryClient = useQueryClient();
  const { tenant } = useTenant();

  type TenantAgent = {
    id: string;
    agent_name: string;
    display_name: string | null;
    last_heartbeat: string | null;
    last_block_sync_at: string | null;
    status: string | null;
  };

  const fetchTenantAgents = async (): Promise<TenantAgent[]> => {
    if (!tenant?.id) return [];

    // ADR-026: usar RPC com tenant explícito para evitar desync de JWT/tenant em views
    const { data, error } = await supabase.rpc('get_agents_list', {
      p_tenant_id: tenant.id,
      p_include_archived: false,
    });

    if (error) {
      console.error('[useDNSFilter] Error fetching tenant agents via RPC:', error);
      throw error;
    }

    const agents = ((data ?? []) as Array<Record<string, unknown>>)
      .filter((agent) => agent?.id && agent?.agent_name)
      .map((agent) => ({
        id: agent.id as string,
        agent_name: agent.agent_name as string,
        display_name: (agent.display_name as string | null) ?? null,
        last_heartbeat: (agent.last_heartbeat as string | null) ?? null,
        last_block_sync_at: (agent.last_block_sync_at as string | null) ?? null,
        status: (agent.status as string | null) ?? null,
      }))
      .sort((a, b) => a.agent_name.localeCompare(b.agent_name));

    return agents;
  };

  // Check if DNS Filter feature is enabled for tenant
  const { data: isEnabled, isLoading: isCheckingEnabled } = useQuery({
    queryKey: ['dns-filter-enabled', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return false;

      const { data, error } = await supabase
        .from('tenant_settings')
        .select('dns_local_filter_enabled')
        .eq('tenant_id', tenant.id)
        .maybeSingle();

      if (error) {
        console.error('[useDNSFilter] Error checking feature flag:', error);
        return false;
      }

      return data?.dns_local_filter_enabled ?? false;
    },
    enabled: !!tenant?.id,
  });

  // Get DNS Filter status for all agents
  const { data: agentStatuses, isLoading: isLoadingStatuses, refetch: refetchStatuses } = useQuery({
    queryKey: ['dns-filter-status', tenant?.id],
    queryFn: async (): Promise<DNSFilterStatus[]> => {
      if (!tenant?.id) return [];

      // Get agents with tenant-safe RPC source
      const agents = await fetchTenantAgents();

      // Check pending jobs for each agent
      const agentIds = (agents?.map(a => a.id).filter((id): id is string => !!id)) || [];
      const { data: pendingJobs } = agentIds.length
        ? await supabase
            .from('jobs')
            .select('agent_id, type')
            .in('agent_id', agentIds)
            .in('type', ['setup_dns_filter', 'sync_blocked_websites'])
            .in('status', ['queued', 'pending', 'running'])
        : { data: [] as Array<{ agent_id: string; type: string }> };

      const pendingJobsMap = new Map<string, Set<string>>();
      pendingJobs?.forEach(job => {
        if (!pendingJobsMap.has(job.agent_id)) {
          pendingJobsMap.set(job.agent_id, new Set());
        }
        pendingJobsMap.get(job.agent_id)?.add(job.type);
      });

      const now = new Date();
      const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);

      return (agents || []).map(agent => {
        const lastHeartbeat = agent.last_heartbeat ? new Date(agent.last_heartbeat) : null;
        const isOnline = lastHeartbeat && lastHeartbeat > thirtyMinutesAgo;
        const pendingTypes = pendingJobsMap.get(agent.id) || new Set();

        // For now, we assume DNS filter is installed if last_block_sync_at is set
        // In future, this could be a dedicated column
        const dnsFilterInstalled = !!agent.last_block_sync_at;

        return {
          agentId: agent.id,
          agentName: agent.agent_name,
          displayName: agent.display_name,
          isOnline: !!isOnline,
          lastHeartbeat: agent.last_heartbeat,
          dnsFilterInstalled,
          dnsFilterVersion: null, // Could be tracked in future
          lastBlockSyncAt: agent.last_block_sync_at,
          pendingSetup: pendingTypes.has('setup_dns_filter'),
          pendingSync: pendingTypes.has('sync_blocked_websites'),
        };
      });
    },
    enabled: !!tenant?.id && isEnabled,
    staleTime: 30 * 1000,
  });

  // Calculate stats
  const stats: DNSFilterStats = {
    totalAgents: agentStatuses?.length || 0,
    onlineAgents: agentStatuses?.filter(a => a.isOnline).length || 0,
    installedCount: agentStatuses?.filter(a => a.dnsFilterInstalled).length || 0,
    pendingInstallCount: agentStatuses?.filter(a => a.pendingSetup).length || 0,
    syncedCount: agentStatuses?.filter(a => {
      if (!a.lastBlockSyncAt) return false;
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      return new Date(a.lastBlockSyncAt) > oneDayAgo;
    }).length || 0,
    pendingSyncCount: agentStatuses?.filter(a => a.pendingSync).length || 0,
  };

  // Enable DNS Filter for tenant
  const enableDNSFilter = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!tenant?.id) throw new Error('Tenant not found');

      const { error } = await supabase
        .from('tenant_settings')
        .update({ dns_local_filter_enabled: enabled })
        .eq('tenant_id', tenant.id);

      if (error) throw error;
      return enabled;
    },
    onSuccess: (enabled) => {
      queryClient.invalidateQueries({ queryKey: ['dns-filter-enabled'] });
      toast.success(enabled ? 'DNS Filter habilitado' : 'DNS Filter desabilitado');
    },
    onError: (error: any) => {
      toast.error(`Erro ao alterar configuração: ${error.message}`);
    },
  });

  // Create setup job for specific agents
  const setupDNSFilter = useMutation({
    mutationFn: async (agentIds: string[]) => {
      if (!tenant?.id) throw new Error('Tenant not found');

      const allTenantAgents = await fetchTenantAgents();
      const agents = allTenantAgents.filter((agent) => agentIds.includes(agent.id));

      if (!agents?.length) throw new Error('No agents found');

      const jobs = agents.map(agent => ({
        agent_id: agent.id,
        agent_name: agent.agent_name,
        tenant_id: tenant.id!,
        type: 'setup_dns_filter',
        status: 'queued',
        priority: 1,
        approved: true,
        payload: {
          action: 'install',
          timestamp: new Date().toISOString(),
        },
      }));

      const { data, error } = await supabase
        .from('jobs')
        .insert(jobs as unknown as Parameters<typeof supabase.from<'jobs'>>[0] extends infer T ? T : never)
        .select('id');

      if (error) throw error;
      return { jobsCreated: data?.length || 0, agents: agents.map(a => a.agent_name), message: '' };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['dns-filter-status'] });
      toast.success(`Instalação do DNS Filter agendada para ${result.jobsCreated} computador(es)`);
    },
    onError: (error: Error) => {
      toast.error(`Erro ao agendar instalação: ${error.message}`);
    },
  });

  // Sync blocked websites to all online agents
  const syncBlockedWebsites = useMutation({
    mutationFn: async (agentIds?: string[]) => {
      const { data, error } = await supabase.functions.invoke('sync-blocked-websites', {
        body: agentIds ? { agent_ids: agentIds } : {},
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['dns-filter-status'] });
      toast.success(data.message || `Sincronização agendada para ${data.jobs_created} computador(es)`);
    },
    onError: (error: Error) => {
      toast.error(`Erro ao sincronizar: ${error.message}`);
    },
  });

  // Collect DNS block events from agents
  const collectDNSBlocks = useMutation({
    mutationFn: async (agentIds?: string[]) => {
      if (!tenant?.id) throw new Error('Tenant not found');

      const allTenantAgents = await fetchTenantAgents();
      let agents;

      if (agentIds?.length) {
        agents = allTenantAgents.filter((agent) => agentIds.includes(agent.id));
      } else {
        // Get all online agents
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        agents = allTenantAgents.filter((agent) => {
          if (!agent.last_heartbeat) return false;
          return new Date(agent.last_heartbeat) > fiveMinutesAgo;
        });
      }

      if (!agents?.length) {
        return { jobsCreated: 0, message: 'Nenhum computador online encontrado' };
      }

      const jobs = agents.map(agent => ({
        agent_id: agent.id,
        agent_name: agent.agent_name,
        tenant_id: tenant.id!,
        type: 'collect_dns_blocks',
        status: 'queued',
        priority: 3,
        approved: true,
        payload: {
          action: 'collect',
          timestamp: new Date().toISOString(),
        },
      }));

      const { data, error } = await supabase
        .from('jobs')
        .insert(jobs as any)
        .select('id');

      if (error) throw error;
      return { jobsCreated: data?.length || 0 };
    },
    onSuccess: (result) => {
      if (result.jobsCreated > 0) {
        toast.success(`Coleta agendada para ${result.jobsCreated} computador(es)`);
      } else {
        toast.info(result.message || 'Nenhuma coleta agendada');
      }
    },
    onError: (error: any) => {
      toast.error(`Erro ao agendar coleta: ${error.message}`);
    },
  });

  // Setup DNS Filter for all online agents that don't have it
  const setupAllAgents = useMutation({
    mutationFn: async () => {
      const agentsNeedingSetup = agentStatuses?.filter(a => a.isOnline && !a.dnsFilterInstalled && !a.pendingSetup) || [];
      if (!agentsNeedingSetup.length) {
        return { jobsCreated: 0, message: 'Todos os computadores online já possuem DNS Filter instalado' };
      }
      
      return setupDNSFilter.mutateAsync(agentsNeedingSetup.map(a => a.agentId));
    },
    onSuccess: (result) => {
      if (result.jobsCreated === 0) {
        toast.info(result.message || 'Nenhuma instalação necessária');
      }
    },
  });

  return {
    // State
    isEnabled: isEnabled ?? false,
    isLoading: isCheckingEnabled || isLoadingStatuses,
    agentStatuses: agentStatuses || [],
    stats,

    // Actions
    enableDNSFilter,
    setupDNSFilter,
    setupAllAgents,
    syncBlockedWebsites,
    collectDNSBlocks,
    refetch: refetchStatuses,
  };
}
