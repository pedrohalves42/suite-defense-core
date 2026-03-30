import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { useUserRole } from '@/hooks/useUserRole';

import { isAgentOnline } from '@/lib/agent-status-constants';
import { logger } from '@/lib/logger';
import { toast } from 'sonner';
import { generateForensicReportPDF } from '@/lib/forensicReportPDF';
import type { Agent, AgentMetrics, AgentStats, StatusFilter, VersionFilter } from './types';

export function useAgentManagement() {
  
  const { t } = useTranslation();
  const { tenant } = useTenant();
  const { isAdmin, isSuperAdmin } = useUserRole();
  const canAccessProcessControl = isAdmin || isSuperAdmin;
  const queryClient = useQueryClient();

  const [agentToDelete, setAgentToDelete] = useState<Agent | null>(null);
  const [agentToDisable, setAgentToDisable] = useState<Agent | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [versionFilter, setVersionFilter] = useState<VersionFilter>('all');
  const [processControlOpen, setProcessControlOpen] = useState(false);
  const [generatingGroupReport, setGeneratingGroupReport] = useState(false);
  const [checkingHealthFor, setCheckingHealthFor] = useState<string | null>(null);

  // Fetch latest versions
  const { data: latestVersions } = useQuery<Record<string, string>>({
    queryKey: ['latest-agent-versions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agent_releases_public')
        .select('platform, version')
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      if (error) { logger.error('Error fetching latest versions', { error }); return {}; }
      const versions: Record<string, string> = {};
      data?.forEach(release => { if (!versions[release.platform]) versions[release.platform] = release.version; });
      return versions;
    },
    staleTime: 5 * 60 * 1000,
  });

  // Fetch agents
  const { data: agents, isLoading, refetch } = useQuery<Agent[]>({
    queryKey: ['agents', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const result = await supabase
        .from('agents')
        .select('id, agent_name, status, enrolled_at, last_heartbeat, tenant_id, os_type, os_version, hostname, agent_version')
        .eq('tenant_id', tenant.id)
        .order('enrolled_at', { ascending: false });
      if (result.error) throw result.error;
      return (result.data || []) as Agent[];
    },
    enabled: !!tenant?.id,
    refetchInterval: false,
    staleTime: 300_000,
    refetchOnWindowFocus: true,
  });

  // Installation status
  const { data: installationStatus } = useQuery<Record<string, boolean>>({
    queryKey: ['installation-status', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id || !agents) return {};
      const agentIds = agents.map(a => a.id);
      if (agentIds.length === 0) return {};
      const { data, error } = await supabase
        .from('installation_analytics')
        .select('agent_id')
        .in('agent_id', agentIds)
        .eq('event_type', 'post_installation');
      if (error) return {};
      const statusMap: Record<string, boolean> = {};
      data?.forEach(event => { statusMap[event.agent_id] = true; });
      return statusMap;
    },
    enabled: !!tenant?.id && !!agents && agents.length > 0,
  });

  // Fetch metrics
  const { data: agentMetrics } = useQuery<Record<string, AgentMetrics>>({
    queryKey: ['agent-metrics', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id || !agents) return {};
      const agentIds = agents.map(a => a.id);
      if (agentIds.length === 0) return {};
      const { data, error } = await supabase
        .from('agent_system_metrics_partitioned')
        .select('agent_id, cpu_usage_percent, memory_usage_percent, disk_usage_percent, collected_at')
        .eq('tenant_id', tenant.id)
        .in('agent_id', agentIds)
        .order('collected_at', { ascending: false });
      if (error) { logger.error('Error fetching agent metrics', { error }); return {}; }
      const metricsMap: Record<string, AgentMetrics> = {};
      data?.forEach(metric => {
        if (!metricsMap[metric.agent_id]) {
          metricsMap[metric.agent_id] = {
            agent_id: metric.agent_id,
            cpu_usage_percent: metric.cpu_usage_percent,
            memory_usage_percent: metric.memory_usage_percent,
            disk_usage_percent: metric.disk_usage_percent,
          };
        }
      });
      return metricsMap;
    },
    enabled: !!tenant?.id && !!agents && agents.length > 0,
    refetchInterval: adaptiveInterval,
  });

  // Helper functions
  const getAgentStatus = (agent: Agent): 'online' | 'offline' | 'pending' | 'disabled' => {
    if (agent.status === 'disabled') return 'disabled';
    if (!agent.last_heartbeat && agent.status === 'pending') return 'pending';
    if (!agent.last_heartbeat) return 'offline';
    return isAgentOnline(agent.last_heartbeat) ? 'online' : 'offline';
  };

  const isVersionOutdated = (agent: Agent): boolean => {
    if (!agent.agent_version || !agent.os_type || !latestVersions) return false;
    const platform = agent.os_type.toLowerCase().includes('windows') ? 'windows'
      : agent.os_type.toLowerCase().includes('linux') ? 'linux' : 'macos';
    const latestVersion = latestVersions[platform];
    if (!latestVersion) return false;
    return agent.agent_version !== latestVersion;
  };

  const getTimeSince = (date: string | null): string => {
    if (!date) return t('agentManagementPage.never');
    const diffMs = new Date().getTime() - new Date(date).getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    if (diffMins < 1) return t('agentManagementPage.justNow');
    if (diffMins < 60) return t('agentManagementPage.minutesAgo', { count: diffMins });
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return t('agentManagementPage.hoursAgo', { count: diffHours });
    const diffDays = Math.floor(diffHours / 24);
    return t('agentManagementPage.daysAgo', { count: diffDays });
  };

  // Filtered agents
  const filteredAgents = useMemo(() => {
    if (!agents) return [];
    return agents.filter(agent => {
      if (searchTerm && !agent.agent_name.toLowerCase().includes(searchTerm.toLowerCase()) &&
          !agent.hostname?.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      if (statusFilter !== 'all') { if (getAgentStatus(agent) !== statusFilter) return false; }
      if (versionFilter === 'outdated' && !isVersionOutdated(agent)) return false;
      if (versionFilter === 'current' && isVersionOutdated(agent)) return false;
      return true;
    });
  }, [agents, searchTerm, statusFilter, versionFilter]);

  // Stats
  const stats = useMemo<AgentStats>(() => {
    if (!agents) return { total: 0, online: 0, offline: 0, pending: 0, disabled: 0, outdated: 0 };
    return {
      total: agents.length,
      online: agents.filter(a => getAgentStatus(a) === 'online').length,
      offline: agents.filter(a => getAgentStatus(a) === 'offline').length,
      pending: agents.filter(a => getAgentStatus(a) === 'pending').length,
      disabled: agents.filter(a => getAgentStatus(a) === 'disabled').length,
      outdated: agents.filter(a => isVersionOutdated(a)).length,
    };
  }, [agents]);

  // Mutations
  const deleteAgentMutation = useMutation({
    mutationFn: async (agentId: string) => {
      if (!tenant?.id) throw new Error('No tenant selected');
      await supabase.from('agent_tokens').delete().eq('agent_id', agentId).eq('tenant_id', tenant.id);
      const { error } = await supabase.from('agents').delete().eq('id', agentId).eq('tenant_id', tenant.id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['agents'] }); toast.success('Computador excluído'); setAgentToDelete(null); },
    onError: () => toast.error('Erro ao excluir'),
  });

  const disableAgentMutation = useMutation({
    mutationFn: async ({ agentId, disable }: { agentId: string; disable: boolean }) => {
      if (!tenant?.id) throw new Error('No tenant selected');
      const { error: agentError } = await supabase.from('agents').update({ status: disable ? 'disabled' : 'active' }).eq('id', agentId).eq('tenant_id', tenant.id);
      if (agentError) throw agentError;
      await supabase.from('agent_tokens').update({ is_active: !disable }).eq('agent_id', agentId).eq('tenant_id', tenant.id);
    },
    onSuccess: (_, variables) => { queryClient.invalidateQueries({ queryKey: ['agents'] }); toast.success(variables.disable ? 'Desativado' : 'Reativado'); setAgentToDisable(null); },
    onError: () => toast.error('Erro ao atualizar'),
  });

  const cleanupGhostAgentsMutation = useMutation({
    mutationFn: async () => {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: agentsToDelete, error: findError } = await supabase
        .from('agents').select('id, agent_name').eq('tenant_id', tenant?.id).is('last_heartbeat', null).lt('enrolled_at', twentyFourHoursAgo);
      if (findError) throw findError;
      if (!agentsToDelete || agentsToDelete.length === 0) return { count: 0 };
      const agentIds = agentsToDelete.map(a => a.id);
      await supabase.from('agent_tokens').delete().in('agent_id', agentIds).eq('tenant_id', tenant!.id);
      const { error: deleteError } = await supabase.from('agents').delete().in('id', agentIds).eq('tenant_id', tenant!.id);
      if (deleteError) throw deleteError;
      return { count: agentsToDelete.length };
    },
    onSuccess: (result) => { queryClient.invalidateQueries({ queryKey: ['agents'] }); toast.success(result.count > 0 ? `${result.count} removido(s)` : 'Nenhum inativo'); },
    onError: () => toast.error('Erro ao limpar'),
  });

  const checkHealthMutation = useMutation({
    mutationFn: async (agent: Agent) => {
      setCheckingHealthFor(agent.id);
      await new Promise(resolve => setTimeout(resolve, 1500));
      await refetch();
    },
    onSuccess: () => { toast.success('Status atualizado'); setCheckingHealthFor(null); },
    onError: () => { toast.error('Erro ao verificar'); setCheckingHealthFor(null); },
  });

  const handleGroupForensicReport = async () => {
    if (!filteredAgents?.length) return;
    setGeneratingGroupReport(true);
    try {
      const ids = filteredAgents.map(a => a.id);
      await generateForensicReportPDF(ids);
      toast.success(`Relatório forense gerado para ${ids.length} máquina(s)!`);
    } catch (err) {
      logger.error('Group forensic report error:', err);
      toast.error('Erro ao gerar relatório forense em grupo');
    } finally {
      setGeneratingGroupReport(false);
    }
  };

  const clearFilters = () => { setSearchTerm(''); setStatusFilter('all'); setVersionFilter('all'); };

  return {
    // Data
    agents, filteredAgents, stats, agentMetrics, installationStatus, latestVersions,
    isLoading, refetch,
    // Filters
    searchTerm, setSearchTerm, statusFilter, setStatusFilter, versionFilter, setVersionFilter, clearFilters,
    // Dialogs
    agentToDelete, setAgentToDelete, agentToDisable, setAgentToDisable,
    // Process control
    processControlOpen, setProcessControlOpen, canAccessProcessControl,
    // Report
    generatingGroupReport, handleGroupForensicReport,
    // Health check
    checkingHealthFor,
    // Mutations
    deleteAgentMutation, disableAgentMutation, cleanupGhostAgentsMutation, checkHealthMutation,
    // Helpers
    getAgentStatus, isVersionOutdated, getTimeSince,
    t,
  };
}
