import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAgentCausality } from '@/hooks/useAgentCausality';
import { useAntivirusStatus } from '@/hooks/useAntivirusStatus';
import { useAgentActions } from '@/hooks/useAgentActions';
import { useActiveTenant } from '@/hooks/useActiveTenant';
import { generateForensicReportPDF } from '@/lib/forensicReportPDF';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';

export function useAgentDetailsDrawer(agentId: string | null, tenantId?: string) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { activeTenant } = useActiveTenant();
  const effectiveTenantId = tenantId || activeTenant?.id;

  const { data: causality, isLoading, isError, refetch } = useAgentCausality(agentId, tenantId);
  const { data: antivirusStatus } = useAntivirusStatus(agentId || '', !!agentId);
  const agentActions = useAgentActions();
  const [generatingReport, setGeneratingReport] = useState(false);

  const {
    data: firewallSkipData,
    isLoading: firewallSkipLoading,
    isError: firewallSkipError,
  } = useQuery({
    queryKey: ['agent-firewall-skip', effectiveTenantId, agentId],
    queryFn: async () => {
      if (!agentId || !effectiveTenantId) return null;
      const { data, error } = await supabase.rpc('get_agents_list', {
        p_tenant_id: effectiveTenantId,
        p_include_archived: true,
      });
      if (error) throw error;
      const agents = (data as Array<Record<string, unknown>> | null) ?? [];
      const agent = agents.find((item) => item.id === agentId);
      if (!agent) throw new Error('Agente não encontrado para o tenant atual');
      return { skip_firewall_remediation: Boolean(agent.skip_firewall_remediation) };
    },
    enabled: !!agentId && !!effectiveTenantId,
    retry: 1,
  });

  const toggleFirewallSkip = useMutation({
    mutationFn: async (skip: boolean) => {
      if (!agentId || !effectiveTenantId) throw new Error('Contexto do agente/tenant indisponível');
      const { error } = await supabase
        .from('agents')
        .update({ skip_firewall_remediation: skip })
        .eq('id', agentId)
        .eq('tenant_id', effectiveTenantId);
      if (error) throw error;
      return skip;
    },
    onSuccess: (skip) => {
      queryClient.setQueryData(['agent-firewall-skip', effectiveTenantId, agentId], {
        skip_firewall_remediation: skip,
      });
      toast.success(skip ? 'Remediação de firewall desativada' : 'Remediação de firewall ativada');
    },
    onError: (err: Error) => {
      toast.error('Erro ao alterar configuração', { description: err.message });
    },
  });

  const handleGenerateForensicReport = async () => {
    if (!agentId) return;
    setGeneratingReport(true);
    try {
      await generateForensicReportPDF([agentId]);
      toast.success('Relatório forense gerado com sucesso!');
    } catch (err) {
      logger.error('Forensic report error:', err);
      toast.error('Erro ao gerar relatório forense');
    } finally {
      setGeneratingReport(false);
    }
  };

  const handleViewDiagnostics = () => {
    if (agentId) navigate(`/admin/diagnostics?agent=${agentId}`);
  };

  const handleViewTimeline = () => {
    if (agentId) navigate(`/admin/agent-timeline?agent=${agentId}`);
  };

  return {
    causality, isLoading, isError, refetch,
    antivirusStatus, agentActions,
    generatingReport, handleGenerateForensicReport,
    firewallSkipData, firewallSkipLoading, firewallSkipError, toggleFirewallSkip,
    effectiveTenantId,
    handleViewDiagnostics, handleViewTimeline,
    navigate,
  };
}
