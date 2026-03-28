import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';
import { useTenant } from '@/hooks/useTenant';
import { prepareJobForInsert } from '@/lib/job-utils';
import type { AgentMetrics, DashboardSummary, SystemAlert, GroupedAlert, SilentProblem } from './types';

export function useAgentMonitoring() {
  const [agents, setAgents] = useState<AgentMetrics[]>([]);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [alerts, setAlerts] = useState<SystemAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'offline'>('all');
  const [selectedAgentForProcesses, setSelectedAgentForProcesses] = useState<{ id: string; name: string } | null>(null);
  const { tenant } = useTenant();

  const fetchDashboardData = useCallback(async (showToast = false) => {
    try {
      if (showToast) setIsRefreshing(true);
      if (!tenant?.id) return;
      
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) return;

      const { data, error } = await supabase.functions.invoke('get-agent-dashboard-data', {
        body: { tenant_id: tenant.id },
        headers: {
          Authorization: `Bearer ${session.session.access_token}`,
        },
      });

      if (error) throw error;

      setSummary(data.summary);
      setAgents(data.agents);
      setAlerts(data.recent_alerts);
      
      if (showToast) {
        toast({
          title: 'Atualizado',
          description: 'Dados atualizados com sucesso',
        });
      }
    } catch (error) {
      logger.error('Error fetching dashboard data', error);
      toast({
        title: 'Erro',
        description: 'Falha ao carregar dados',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [tenant?.id]);

  useEffect(() => {
    if (tenant?.id) {
      fetchDashboardData();
    }
  }, [tenant?.id, fetchDashboardData]);

  useEffect(() => {
    if (!tenant?.id) return;
    const refreshInterval = setInterval(fetchDashboardData, 300_000);
    return () => clearInterval(refreshInterval);
  }, [tenant?.id, fetchDashboardData]);

  const acknowledgeAlert = useCallback(async (alertId: string) => {
    try {
      const { error } = await supabase
        .from('system_alerts')
        .update({ 
          acknowledged: true, 
          acknowledged_at: new Date().toISOString(),
          acknowledged_by: (await supabase.auth.getUser()).data.user?.id,
          resolved: true,
          resolved_at: new Date().toISOString(),
          resolved_by: (await supabase.auth.getUser()).data.user?.id,
          status: 'resolved',
        })
        .eq('id', alertId);

      if (error) throw error;

      toast({
        title: 'Alerta Resolvido',
        description: 'O alerta foi marcado como resolvido',
      });
      
      fetchDashboardData();
    } catch (error) {
      logger.error('Error acknowledging alert', error);
      toast({
        title: 'Erro',
        description: 'Falha ao resolver alerta',
        variant: 'destructive',
      });
    }
  }, [fetchDashboardData]);

  const groupedAlerts = useMemo((): GroupedAlert[] => {
    const groups: Record<string, GroupedAlert> = {};
    
    alerts.forEach(alert => {
      const metricValue = alert.details?.disk_usage || 
                         alert.details?.memory_usage || 
                         alert.details?.cpu_usage || null;
      
      const metricRange = metricValue ? Math.floor(metricValue / 5) * 5 : 'unknown';
      const key = `${alert.alert_type}-${alert.title}-${metricRange}`;
      
      if (!groups[key]) {
        groups[key] = { ...alert, count: 1, latestValue: metricValue, groupKey: key };
      } else {
        groups[key].count++;
        if (new Date(alert.created_at) > new Date(groups[key].created_at)) {
          groups[key].created_at = alert.created_at;
          groups[key].latestValue = metricValue;
        }
      }
    });
    
    return Object.values(groups).sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [alerts]);

  const resolveAlertGroup = useCallback(async (alertType: string, title: string, agentId?: string | null) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: 'Erro',
          description: 'Você precisa estar logado para resolver alertas',
          variant: 'destructive',
        });
        return;
      }

      logger.info('[resolveAlertGroup] Resolvendo alertas:', { alertType, title });

      const { data: resolvedAlerts, error } = await supabase
        .from('system_alerts')
        .update({ 
          resolved: true, 
          resolved_at: new Date().toISOString(),
          resolved_by: user.id,
          acknowledged: true,
          acknowledged_at: new Date().toISOString(),
          acknowledged_by: user.id,
          status: 'resolved',
        })
        .eq('alert_type', alertType)
        .eq('title', title)
        .eq('resolved', false)
        .select('id, agent_id');

      if (error) throw error;

      const resolvedCount = resolvedAlerts?.length || 0;

      if (resolvedCount === 0) {
        toast({
          title: 'Nenhum alerta encontrado',
          description: 'Não foram encontrados alertas pendentes com este título',
          variant: 'default',
        });
        return;
      }

      const targetAgentId = agentId || resolvedAlerts?.[0]?.agent_id;
      let jobCreated = false;
      
      if (targetAgentId && tenant?.id) {
        const targetAgent = agents.find(a => a.id === targetAgentId);
        const agentName = targetAgent?.name || 'Agente Desconhecido';
        
        const jobPayload = { 
          source: 'alert_resolution',
          alert_type: alertType,
          resolved_by: user.id,
        };
        
        const jobWithHash = await prepareJobForInsert({
          tenant_id: tenant.id,
          agent_id: targetAgentId,
          agent_name: agentName,
          type: 'health_report',
          status: 'queued',
          payload: jobPayload,
        });
        
        const { error: jobError } = await supabase
          .from('jobs')
          .insert(jobWithHash);

        if (!jobError) {
          jobCreated = true;
        } else {
          logger.warn('Failed to create health_report job', jobError);
        }
      }

      toast({
        title: '✓ Alertas Resolvidos',
        description: `${resolvedCount} alerta(s) arquivado(s)${jobCreated ? ' e verificação iniciada' : ''}`,
      });
      
      fetchDashboardData();
    } catch (error: any) {
      logger.error('Error resolving alert group', error);
      toast({
        title: 'Erro ao resolver alertas',
        description: error?.message || 'Falha ao resolver alertas. Verifique se está logado.',
        variant: 'destructive',
      });
    }
  }, [agents, tenant?.id, fetchDashboardData]);

  const silentProblems = useMemo((): SilentProblem[] => {
    const problems: SilentProblem[] = [];
    
    const longOffline = agents.filter(a => {
      if (!a.last_heartbeat) return true;
      const lastHB = new Date(a.last_heartbeat);
      return (Date.now() - lastHB.getTime()) > 48 * 60 * 60 * 1000;
    });
    
    if (longOffline.length > 0) {
      problems.push({
        icon: '📴',
        text: `${longOffline.length} computador(es) offline há mais de 48h`,
        severity: 'high',
        agents: longOffline.map(a => a.name)
      });
    }
    
    return problems;
  }, [agents]);

  const filteredAgents = useMemo(() => {
    return agents.filter((agent) => {
      const matchesSearch = agent.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        agent.hostname?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'all' || 
        (statusFilter === 'online' && agent.is_online) ||
        (statusFilter === 'offline' && !agent.is_online);
      return matchesSearch && matchesStatus;
    });
  }, [agents, searchTerm, statusFilter]);

  const sortedAgents = useMemo(() => {
    return [...filteredAgents].sort((a, b) => {
      const getRiskScore = (agent: AgentMetrics) => {
        if (!agent.is_online) return 2;
        const hasCritical = (agent.cpu_usage ?? 0) > 90 || (agent.disk_usage ?? 0) > 90;
        const hasMedium = (agent.cpu_usage ?? 0) > 70 || (agent.memory_usage ?? 0) > 85 || (agent.disk_usage ?? 0) > 80;
        if (hasCritical) return 3;
        if (hasMedium) return 1;
        return 0;
      };
      return getRiskScore(b) - getRiskScore(a);
    });
  }, [filteredAgents]);

  return {
    agents,
    summary,
    alerts,
    loading,
    isRefreshing,
    searchTerm,
    setSearchTerm,
    statusFilter,
    setStatusFilter,
    selectedAgentForProcesses,
    setSelectedAgentForProcesses,
    tenant,
    fetchDashboardData,
    acknowledgeAlert,
    groupedAlerts,
    resolveAlertGroup,
    silentProblems,
    sortedAgents,
  };
}
