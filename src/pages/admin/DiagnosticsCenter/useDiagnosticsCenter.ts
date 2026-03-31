import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import type { RpcAgentRow } from '@/types/rpc';
import { useTenant } from '@/hooks/useTenant';
import { deriveAgentState } from '@/lib/agent-state-machine';
import { toast } from 'sonner';
import { WifiOff, Clock, Key, AlertTriangle, AlertCircle } from 'lucide-react';
import type { ProblematicAgent, ProblemCounts, IssueInfo } from './types';

export function useDiagnosticsCenter() {
  const [searchParams, setSearchParams] = useSearchParams();
  const preSelectedAgentId = searchParams.get('agent');
  const viewMode = searchParams.get('view') as 'default' | 'soc' | null;

  const { tenant, loading: tenantLoading } = useTenant();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(preSelectedAgentId);
  const [agentToCleanup, setAgentToCleanup] = useState<ProblematicAgent | null>(null);
  const [showBulkCleanupDialog, setShowBulkCleanupDialog] = useState(false);
  const [socMode, setSocMode] = useState<boolean>(viewMode === 'soc');

  // Query all agents
  const { data: allAgents = [], isLoading: agentsLoading, refetch: refetchAgents } = useQuery({
    queryKey: ['diagnostics-agents', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const { data, error } = await supabase.rpc('get_agents_list', {
        p_tenant_id: tenant.id,
        p_include_archived: false,
      });
      if (error) throw error;
      return ((data || []) as unknown as RpcAgentRow[]).sort((a, b) => {
        if (!a.last_heartbeat && !b.last_heartbeat) return 0;
        if (!a.last_heartbeat) return 1;
        if (!b.last_heartbeat) return -1;
        return b.last_heartbeat.localeCompare(a.last_heartbeat);
      });
    },
    enabled: !tenantLoading && !!tenant?.id,
    refetchInterval: false,
    staleTime: 600_000,
    refetchOnWindowFocus: false,
  });

  // Query problematic agents
  const { data: problematicAgents = [], refetch: refetchProblematic } = useQuery({
    queryKey: ['problematic-agents', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const { data, error } = await supabase
        .from('v_problematic_agents')
        .select('id, agent_name, hostname, os_type, status, agent_version, last_heartbeat, enrolled_at, issue_type, issue_details')
        .order('enrolled_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as ProblematicAgent[];
    },
    refetchInterval: false,
    staleTime: 600_000,
    refetchOnWindowFocus: false,
    enabled: !tenantLoading && !!tenant?.id,
  });

  // Query agents with recent failed jobs
  const { data: agentsWithFailedJobs = [] } = useQuery({
    queryKey: ['agents-failed-jobs', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('jobs')
        .select('agent_name')
        .eq('tenant_id', tenant.id)
        .eq('status', 'failed')
        .gte('created_at', since);
      if (error) return [];
      const names = [...new Set((data || []).map((j: any) => j.agent_name))];
      return names as string[];
    },
    enabled: !tenantLoading && !!tenant?.id,
    refetchInterval: false,
    staleTime: 600_000,
    refetchOnWindowFocus: false,
  });

  const selectedAgent = useMemo(() => {
    return allAgents.find(a => a.id === selectedAgentId) || null;
  }, [allAgents, selectedAgentId]);

  const selectedAgentState = useMemo(() => {
    if (!selectedAgent) return null;
    return deriveAgentState({
      is_isolated: selectedAgent.is_isolated,
      safe_mode_entered_at: selectedAgent.safe_mode_entered_at,
      last_heartbeat: selectedAgent.last_heartbeat,
      is_throttled: selectedAgent.is_throttled,
    });
  }, [selectedAgent]);

  const cleanupMutation = useMutation({
    mutationFn: async (agentId: string) => {
      const { data, error } = await supabase.rpc('cleanup_problematic_agent', { p_agent_id: agentId });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: { agent_name: string }) => {
      toast.success(`Computador "${data.agent_name}" limpo com sucesso`);
      queryClient.invalidateQueries({ queryKey: ['problematic-agents'] });
      queryClient.invalidateQueries({ queryKey: ['diagnostics-agents'] });
      setAgentToCleanup(null);
    },
    onError: (error: Error) => {
      toast.error(`Erro ao limpar: ${error.message}`);
    },
  });

  const bulkCleanupMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('cleanup_all_problematic_agents', { p_tenant_id: tenant?.id });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: { total_cleaned: number }) => {
      toast.success(`${data.total_cleaned} computadores limpos com sucesso`);
      queryClient.invalidateQueries({ queryKey: ['problematic-agents'] });
      queryClient.invalidateQueries({ queryKey: ['diagnostics-agents'] });
      setShowBulkCleanupDialog(false);
    },
    onError: (error: Error) => {
      toast.error(`Erro na limpeza em massa: ${error.message}`);
    },
  });

  const handleDownloadReinstallScript = async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-reinstall-script`);
      if (!response.ok) throw new Error('Falha ao baixar script');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'reinstall-cybershield-agent.ps1';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('Script de reinstalação baixado');
    } catch (error) {
      toast.error(`Erro ao baixar script: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }
  };

  const getIssueInfo = (issueType: string | null): IssueInfo => {
    switch (issueType) {
      case 'no_heartbeat':
        return { label: 'Sem Comunicação', variant: 'destructive', icon: WifiOff };
      case 'stale_heartbeat':
        return { label: 'Comunicação Desatualizada', variant: 'warning', icon: Clock };
      case 'no_token':
        return { label: 'Credenciais Inválidas', variant: 'destructive', icon: Key };
      case 'failed_jobs':
        return { label: 'Tarefas Falhando', variant: 'warning', icon: AlertTriangle };
      default:
        return { label: 'Problema Desconhecido', variant: 'secondary', icon: AlertCircle };
    }
  };

  const handleSocModeChange = (value: string) => {
    const isSoc = value === 'soc';
    setSocMode(isSoc);
    setSearchParams(prev => {
      if (isSoc) prev.set('view', 'soc');
      else prev.delete('view');
      return prev;
    });
  };

  const problemCounts = useMemo<ProblemCounts>(() => {
    const problematicIds = new Set(problematicAgents.map(a => a.agent_name));
    const extraFailedAgents = agentsWithFailedJobs.filter(name => !problematicIds.has(name));
    const totalWithFailures = problematicAgents.length + extraFailedAgents.length;
    return {
      total: totalWithFailures,
      noHeartbeat: problematicAgents.filter(a => a.issue_type === 'no_heartbeat' || a.issue_type === 'stale_heartbeat').length,
      noToken: problematicAgents.filter(a => a.issue_type === 'no_token').length,
      failedJobs: agentsWithFailedJobs.length,
      criticalCount: problematicAgents.filter(a => a.issue_type === 'no_token' || a.issue_type === 'no_heartbeat').length,
    };
  }, [problematicAgents, agentsWithFailedJobs]);

  const filteredAgents = useMemo(() => {
    if (!socMode) return allAgents;
    return allAgents.filter(a =>
      problematicAgents.some(p => p.id === a.id &&
        (p.issue_type === 'no_heartbeat' || p.issue_type === 'no_token' || p.issue_type === 'stale_heartbeat')
      ) ||
      a.is_isolated ||
      !!a.safe_mode_entered_at
    );
  }, [allAgents, problematicAgents, socMode]);

  const handleRefresh = () => {
    refetchAgents();
    refetchProblematic();
  };

  return {
    tenant,
    navigate,
    queryClient,
    allAgents,
    agentsLoading,
    problematicAgents,
    selectedAgent,
    selectedAgentId,
    setSelectedAgentId,
    selectedAgentState,
    socMode,
    handleSocModeChange,
    problemCounts,
    filteredAgents,
    agentToCleanup,
    setAgentToCleanup,
    showBulkCleanupDialog,
    setShowBulkCleanupDialog,
    cleanupMutation,
    bulkCleanupMutation,
    handleDownloadReinstallScript,
    getIssueInfo,
    handleRefresh,
  };
}

