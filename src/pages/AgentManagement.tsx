import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { logger } from '@/lib/logger';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useTenant } from '@/hooks/useTenant';
import { toast } from 'sonner';
import { formatBrazilDateTime } from '@/lib/date-utils';
import { 
  Server, Trash2, Power, PowerOff, XCircle, Clock, Activity, 
  AlertTriangle, Loader2, Trash, Search, Monitor, Cpu, HardDrive,
  RefreshCw, Shield, ShieldAlert, ShieldCheck, ArrowUpCircle, Filter,
  MemoryStick, Terminal
} from 'lucide-react';
import AgentInstallationGuide from '@/components/AgentInstallationGuide';
import { HelpTooltip } from '@/components/ui/tech-tooltip';
import { motion, AnimatePresence } from 'framer-motion';
import { Progress } from '@/components/ui/progress';
import { DiskMetricsPanel } from '@/components/agent/DiskMetricsPanel';
import { ProcessControlDispatcher } from '@/components/admin/ProcessControlDispatcher';
import { useUserRole } from '@/hooks/useUserRole';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface Agent {
  id: string;
  agent_name: string;
  status: string;
  enrolled_at: string;
  last_heartbeat: string | null;
  tenant_id: string;
  os_type: string | null;
  os_version: string | null;
  hostname: string | null;
  agent_version: string | null;
}

type StatusFilter = 'all' | 'online' | 'offline' | 'pending' | 'disabled';
type VersionFilter = 'all' | 'outdated' | 'current';

export default function AgentManagement() {
  const { t } = useTranslation();
  const { tenant } = useTenant();
  const { isAdmin, isSuperAdmin } = useUserRole();
  const canAccessProcessControl = isAdmin || isSuperAdmin;
  const queryClient = useQueryClient();
  const [agentToDelete, setAgentToDelete] = useState<Agent | null>(null);
  const [agentToDisable, setAgentToDisable] = useState<Agent | null>(null);
  const [agentToForceDelete, setAgentToForceDelete] = useState<Agent | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [versionFilter, setVersionFilter] = useState<VersionFilter>('all');
  const [processControlOpen, setProcessControlOpen] = useState(false);

  // Fetch latest versions from database
  const { data: latestVersions } = useQuery<Record<string, string>>({
    queryKey: ['latest-agent-versions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agent_releases_public')
        .select('platform, version')
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      
      if (error) {
        logger.error('Error fetching latest versions', { error });
        return {};
      }
      
      // Get the latest version per platform
      const versions: Record<string, string> = {};
      data?.forEach(release => {
        if (!versions[release.platform]) {
          versions[release.platform] = release.version;
        }
      });
      return versions;
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
  const [checkingHealthFor, setCheckingHealthFor] = useState<string | null>(null);

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
    refetchInterval: 300000, // COST-OPT: 30s → 5min
  });

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

  // Fetch latest metrics for all agents
  interface AgentMetrics {
    agent_id: string;
    cpu_usage_percent: number | null;
    memory_usage_percent: number | null;
    disk_usage_percent: number | null;
  }
  
  const { data: agentMetrics } = useQuery<Record<string, AgentMetrics>>({
    queryKey: ['agent-metrics', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id || !agents) return {};
      const agentIds = agents.map(a => a.id);
      if (agentIds.length === 0) return {};
      
      // Get latest metric for each agent using agent_system_metrics_partitioned
      const { data, error } = await supabase
        .from('agent_system_metrics_partitioned')
        .select('agent_id, cpu_usage_percent, memory_usage_percent, disk_usage_percent, collected_at')
        .eq('tenant_id', tenant.id)
        .in('agent_id', agentIds)
        .order('collected_at', { ascending: false });
      
      if (error) {
        logger.error('Error fetching agent metrics', { error });
        return {};
      }
      
      // Get the latest metric for each agent
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
    refetchInterval: 300000, // COST-OPT: 60s → 5min
  });

  // Helper functions
  const getAgentStatus = (agent: Agent): 'online' | 'offline' | 'pending' | 'disabled' => {
    if (agent.status === 'disabled') return 'disabled';
    // Só pending se nunca teve heartbeat E status ainda é 'pending'
    if (!agent.last_heartbeat && agent.status === 'pending') return 'pending';
    // Fallback se heartbeat null mas status não é pending (agente provavelmente offline)
    if (!agent.last_heartbeat) return 'offline';
    const diffMins = (new Date().getTime() - new Date(agent.last_heartbeat).getTime()) / (1000 * 60);
    return diffMins < 5 ? 'online' : 'offline';
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

  // Filter agents
  const filteredAgents = useMemo(() => {
    if (!agents) return [];
    return agents.filter(agent => {
      // Search filter
      if (searchTerm && !agent.agent_name.toLowerCase().includes(searchTerm.toLowerCase()) &&
          !agent.hostname?.toLowerCase().includes(searchTerm.toLowerCase())) {
        return false;
      }
      // Status filter
      if (statusFilter !== 'all') {
        const status = getAgentStatus(agent);
        if (status !== statusFilter) return false;
      }
      // Version filter
      if (versionFilter === 'outdated' && !isVersionOutdated(agent)) return false;
      if (versionFilter === 'current' && isVersionOutdated(agent)) return false;
      return true;
    });
  }, [agents, searchTerm, statusFilter, versionFilter]);

  // Stats
  const stats = useMemo(() => {
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
      await supabase.from('agent_tokens').delete().eq('agent_id', agentId);
      const { error } = await supabase.from('agents').delete().eq('id', agentId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      toast.success('Computador excluído');
      setAgentToDelete(null);
    },
    onError: () => toast.error('Erro ao excluir'),
  });

  const disableAgentMutation = useMutation({
    mutationFn: async ({ agentId, disable }: { agentId: string; disable: boolean }) => {
      const { error: agentError } = await supabase
        .from('agents')
        .update({ status: disable ? 'disabled' : 'active' })
        .eq('id', agentId);
      if (agentError) throw agentError;
      // Disable or re-enable tokens accordingly
      await supabase.from('agent_tokens').update({ is_active: !disable }).eq('agent_id', agentId);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      toast.success(variables.disable ? 'Desativado' : 'Reativado');
      setAgentToDisable(null);
    },
    onError: () => toast.error('Erro ao atualizar'),
  });

  const cleanupGhostAgentsMutation = useMutation({
    mutationFn: async () => {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: agentsToDelete, error: findError } = await supabase
        .from('agents')
        .select('id, agent_name')
        .eq('tenant_id', tenant?.id)
        .is('last_heartbeat', null)
        .lt('enrolled_at', twentyFourHoursAgo);
      
      if (findError) throw findError;
      if (!agentsToDelete || agentsToDelete.length === 0) return { count: 0 };
      
      const agentIds = agentsToDelete.map(a => a.id);
      await supabase.from('agent_tokens').delete().in('agent_id', agentIds);
      const { error: deleteError } = await supabase.from('agents').delete().in('id', agentIds);
      if (deleteError) throw deleteError;
      return { count: agentsToDelete.length };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      toast.success(result.count > 0 ? `${result.count} removido(s)` : 'Nenhum inativo');
    },
    onError: () => toast.error('Erro ao limpar'),
  });

  const checkHealthMutation = useMutation({
    mutationFn: async (agent: Agent) => {
      setCheckingHealthFor(agent.id);
      // Wait a bit and then refetch to simulate health check
      await new Promise(resolve => setTimeout(resolve, 1500));
      await refetch();
    },
    onSuccess: () => {
      toast.success('Status atualizado');
      setCheckingHealthFor(null);
    },
    onError: () => {
      toast.error('Erro ao verificar');
      setCheckingHealthFor(null);
    },
  });

  const getOsIcon = (osType: string | null) => {
    if (!osType) return <Monitor className="h-5 w-5" />;
    const os = osType.toLowerCase();
    if (os.includes('windows')) return <Monitor className="h-5 w-5" />;
    if (os.includes('linux')) return <Cpu className="h-5 w-5" />;
    return <HardDrive className="h-5 w-5" />;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-cyber rounded-xl border border-primary/20">
            <Server className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h2 className="text-3xl font-bold">{t('agentManagementPage.title')}</h2>
            <p className="text-muted-foreground">
              {t('agentManagementPage.subtitle')}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            {t('agentManagementPage.refresh')}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => cleanupGhostAgentsMutation.mutate()}
            disabled={cleanupGhostAgentsMutation.isPending}
          >
            {cleanupGhostAgentsMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Trash className="h-4 w-4 mr-2" />
            )}
            {t('common.delete')}
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setStatusFilter('all')}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <Server className="h-5 w-5 text-muted-foreground" />
              <span className="text-2xl font-bold">{stats.total}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Total</p>
          </CardContent>
        </Card>
        <Card className={`cursor-pointer hover:border-green-500/50 transition-colors ${statusFilter === 'online' ? 'border-green-500' : ''}`} onClick={() => setStatusFilter('online')}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <Activity className="h-5 w-5 text-green-500" />
              <span className="text-2xl font-bold text-green-500">{stats.online}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Online</p>
          </CardContent>
        </Card>
        <Card className={`cursor-pointer hover:border-red-500/50 transition-colors ${statusFilter === 'offline' ? 'border-red-500' : ''}`} onClick={() => setStatusFilter('offline')}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <XCircle className="h-5 w-5 text-red-500" />
              <span className="text-2xl font-bold text-red-500">{stats.offline}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Offline</p>
          </CardContent>
        </Card>
        <Card className={`cursor-pointer hover:border-orange-500/50 transition-colors ${statusFilter === 'pending' ? 'border-orange-500' : ''}`} onClick={() => setStatusFilter('pending')}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <Clock className="h-5 w-5 text-orange-500" />
              <span className="text-2xl font-bold text-orange-500">{stats.pending}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">{t('agentManagementPage.pending')}</p>
          </CardContent>
        </Card>
        <Card className={`cursor-pointer hover:border-muted-foreground/50 transition-colors ${statusFilter === 'disabled' ? 'border-muted-foreground' : ''}`} onClick={() => setStatusFilter('disabled')}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <PowerOff className="h-5 w-5 text-muted-foreground" />
              <span className="text-2xl font-bold">{stats.disabled}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Desativado</p>
          </CardContent>
        </Card>
        <Card className={`cursor-pointer hover:border-amber-500/50 transition-colors ${versionFilter === 'outdated' ? 'border-amber-500' : ''}`} onClick={() => setVersionFilter(versionFilter === 'outdated' ? 'all' : 'outdated')}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <ArrowUpCircle className="h-5 w-5 text-amber-500" />
              <span className="text-2xl font-bold text-amber-500">{stats.outdated}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">{t('agentManagementPage.outdated')}</p>
          </CardContent>
        </Card>
      </div>

      {/* Process Control Section - Admin Only */}
      {canAccessProcessControl && agents && agents.length > 0 && (
        <Collapsible open={processControlOpen} onOpenChange={setProcessControlOpen}>
          <Card className="border-amber-500/30">
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-amber-500/10 rounded-lg">
                      <Terminal className="h-5 w-5 text-amber-500" />
                    </div>
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        Controle Remoto de Processos
                        <Badge variant="outline" className="text-xs border-amber-500 text-amber-500">
                          Admin
                        </Badge>
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Encerrar processos ou gerenciar serviços remotamente
                      </CardDescription>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm">
                    {processControlOpen ? 'Fechar' : 'Expandir'}
                  </Button>
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0">
                <ProcessControlDispatcher 
                  agents={agents.filter(a => {
                    const status = getAgentStatus(a);
                    return status === 'online';
                  }).map(a => ({
                    id: a.id,
                    agent_name: a.agent_name,
                    hostname: a.hostname,
                    status: a.status,
                    os_type: a.os_type
                  }))} 
                />
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('agentManagementPage.searchPlaceholder')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
              <SelectTrigger className="w-full md:w-[180px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('agentManagementPage.allStatus')}</SelectItem>
                <SelectItem value="online">{t('agentManagementPage.online')}</SelectItem>
                <SelectItem value="offline">{t('agentManagementPage.offline')}</SelectItem>
                <SelectItem value="pending">{t('agentManagementPage.pending')}</SelectItem>
                <SelectItem value="disabled">{t('agentManagementPage.disabled')}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={versionFilter} onValueChange={(v) => setVersionFilter(v as VersionFilter)}>
              <SelectTrigger className="w-full md:w-[180px]">
                <Shield className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Versão" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('agentManagementPage.allVersions')}</SelectItem>
                <SelectItem value="outdated">{t('agentManagementPage.outdated')}</SelectItem>
                <SelectItem value="current">{t('agentManagementPage.current')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Agent Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <AnimatePresence mode="popLayout">
          {filteredAgents.map((agent) => {
            const status = getAgentStatus(agent);
            const outdated = isVersionOutdated(agent);
            const platform = agent.os_type?.toLowerCase().includes('windows') ? 'windows' 
              : agent.os_type?.toLowerCase().includes('linux') ? 'linux' : 'macos';
            
            return (
              <motion.div
                key={agent.id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
              >
                <Card className={`relative overflow-hidden ${
                  status === 'online' ? 'border-green-500/30' :
                  status === 'offline' ? 'border-red-500/30' :
                  status === 'pending' ? 'border-orange-500/30' : 'border-muted'
                }`}>
                  {/* Status indicator bar */}
                  <div className={`absolute top-0 left-0 right-0 h-1 ${
                    status === 'online' ? 'bg-green-500' :
                    status === 'offline' ? 'bg-red-500' :
                    status === 'pending' ? 'bg-orange-500' : 'bg-muted'
                  }`} />
                  
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${
                          status === 'online' ? 'bg-green-500/10' :
                          status === 'offline' ? 'bg-red-500/10' :
                          status === 'pending' ? 'bg-orange-500/10' : 'bg-muted'
                        }`}>
                          {getOsIcon(agent.os_type)}
                        </div>
                        <div>
                          <CardTitle className="text-base">{agent.agent_name}</CardTitle>
                          <CardDescription className="text-xs">
                            {agent.hostname || agent.os_type || 'Sistema desconhecido'}
                          </CardDescription>
                        </div>
                      </div>
                      {/* Status Badge */}
                      <Badge variant={
                        status === 'online' ? 'default' :
                        status === 'offline' ? 'destructive' :
                        status === 'pending' ? 'secondary' : 'outline'
                      } className={status === 'online' ? 'bg-green-500' : ''}>
                        {status === 'online' && <Activity className="h-3 w-3 mr-1 animate-pulse" />}
                        {status === 'offline' && <XCircle className="h-3 w-3 mr-1" />}
                        {status === 'pending' && <Clock className="h-3 w-3 mr-1" />}
                        {status === 'disabled' && <PowerOff className="h-3 w-3 mr-1" />}
                        {status === 'online' ? t('agentManagementPage.online') :
                         status === 'offline' ? t('agentManagementPage.offline') :
                         status === 'pending' ? t('agentManagementPage.pending') : t('agentManagementPage.disabled')}
                      </Badge>
                    </div>
                  </CardHeader>
                  
                  <CardContent className="space-y-3">
                    {/* Version with outdated warning */}
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <HelpTooltip term="versão do agente" />
                        {t('agentManagementPage.version')}:
                      </span>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={`font-mono text-xs ${outdated ? 'border-amber-500 text-amber-500' : ''}`}>
                          {agent.agent_version || 'N/A'}
                        </Badge>
                        {outdated && (
                          <Badge className="bg-amber-500/10 text-amber-500 text-xs">
                            <ArrowUpCircle className="h-3 w-3 mr-1" />
                            Atualização disponível
                          </Badge>
                        )}
                      </div>
                    </div>
                    
                    {/* Last heartbeat */}
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <HelpTooltip term="heartbeat" />
                        {t('agentManagementPage.lastSeen')}:
                      </span>
                      <span className={status === 'offline' ? 'text-red-500' : ''}>
                        {getTimeSince(agent.last_heartbeat)}
                      </span>
                    </div>
                    
                    {/* Registration date */}
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Registrado:</span>
                      <span>{formatBrazilDateTime(agent.enrolled_at, 'date')}</span>
                    </div>

                    {/* Protection status */}
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Proteção:</span>
                      {status === 'online' && !outdated ? (
                        <span className="flex items-center gap-1 text-green-500">
                          <ShieldCheck className="h-4 w-4" />
                          Protegido
                        </span>
                      ) : status === 'online' && outdated ? (
                        <span className="flex items-center gap-1 text-amber-500">
                          <ShieldAlert className="h-4 w-4" />
                          Parcial
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Shield className="h-4 w-4" />
                          Inativo
                        </span>
                      )}
                    </div>

                    {/* System Metrics (CPU, Memory, Disk) */}
                    {agentMetrics?.[agent.id] && status !== 'pending' && (
                      <div className="space-y-2 pt-2 border-t">
                        <div className="flex items-center justify-between text-xs">
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <Cpu className="h-3 w-3" /> CPU
                          </span>
                          <span className={`font-medium ${
                            (agentMetrics[agent.id].cpu_usage_percent ?? 0) > 80 ? 'text-red-500' :
                            (agentMetrics[agent.id].cpu_usage_percent ?? 0) > 60 ? 'text-amber-500' : 'text-green-500'
                          }`}>
                            {agentMetrics[agent.id].cpu_usage_percent?.toFixed(0) ?? 'N/A'}%
                          </span>
                        </div>
                        <Progress 
                          value={agentMetrics[agent.id].cpu_usage_percent ?? 0} 
                          className={`h-1.5 ${
                            (agentMetrics[agent.id].cpu_usage_percent ?? 0) > 80 ? '[&>div]:bg-red-500' :
                            (agentMetrics[agent.id].cpu_usage_percent ?? 0) > 60 ? '[&>div]:bg-amber-500' : '[&>div]:bg-green-500'
                          }`}
                        />
                        
                        <div className="flex items-center justify-between text-xs">
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <MemoryStick className="h-3 w-3" /> Memória
                          </span>
                          <span className={`font-medium ${
                            (agentMetrics[agent.id].memory_usage_percent ?? 0) > 80 ? 'text-red-500' :
                            (agentMetrics[agent.id].memory_usage_percent ?? 0) > 60 ? 'text-amber-500' : 'text-green-500'
                          }`}>
                            {agentMetrics[agent.id].memory_usage_percent?.toFixed(0) ?? 'N/A'}%
                          </span>
                        </div>
                        <Progress 
                          value={agentMetrics[agent.id].memory_usage_percent ?? 0} 
                          className={`h-1.5 ${
                            (agentMetrics[agent.id].memory_usage_percent ?? 0) > 80 ? '[&>div]:bg-red-500' :
                            (agentMetrics[agent.id].memory_usage_percent ?? 0) > 60 ? '[&>div]:bg-amber-500' : '[&>div]:bg-green-500'
                          }`}
                        />
                        
                        {/* Seção de Discos Múltiplos */}
                        <DiskMetricsPanel agentId={agent.id} compact />
                      </div>
                    )}

                    {/* No metrics message for online agents */}
                    {!agentMetrics?.[agent.id] && status === 'online' && (
                      <div className="text-xs text-muted-foreground text-center py-2 border-t">
                        Aguardando métricas...
                      </div>
                    )}

                    {/* Installation guide for pending agents */}
                    {status === 'pending' && (
                      <div className="pt-2 border-t">
                        <AgentInstallationGuide
                          agent={agent}
                          hasPostInstallation={installationStatus?.[agent.id] || false}
                        />
                      </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex gap-2 pt-2 border-t">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => checkHealthMutation.mutate(agent)}
                        disabled={checkingHealthFor === agent.id || status === 'disabled'}
                      >
                        {checkingHealthFor === agent.id ? (
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4 mr-1" />
                        )}
                        {t('agentManagementPage.checkHealth')}
                      </Button>
                      {status === 'disabled' ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => disableAgentMutation.mutate({ agentId: agent.id, disable: false })}
                        >
                          <Power className="h-4 w-4 mr-1" />
                          {t('common.edit')}
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => setAgentToDisable(agent)}
                        >
                          <PowerOff className="h-4 w-4 mr-1" />
                           {t('agentManagementPage.disableAgent')}
                        </Button>
                      )}
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => setAgentToDelete(agent)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Empty state */}
      {filteredAgents.length === 0 && (
        <Card className="p-12">
          <div className="text-center space-y-4">
            <Server className="h-16 w-16 mx-auto text-muted-foreground/50" />
            <div>
              <h3 className="text-lg font-medium">{t('agentManagementPage.noComputers')}</h3>
              <p className="text-muted-foreground">
                {searchTerm || statusFilter !== 'all' || versionFilter !== 'all' 
                  ? t('agentManagementPage.noComputersDesc')
                  : t('agentManagementPage.installFirst')}
              </p>
            </div>
            {(searchTerm || statusFilter !== 'all' || versionFilter !== 'all') && (
              <Button variant="outline" onClick={() => {
                setSearchTerm('');
                setStatusFilter('all');
                setVersionFilter('all');
              }}>
                Limpar Filtros
              </Button>
            )}
          </div>
        </Card>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!agentToDelete} onOpenChange={() => setAgentToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('agentManagementPage.deleteAgent')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('agentManagementPage.deleteConfirm', { name: agentToDelete?.agent_name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
             <AlertDialogCancel>{t('agentManagementPage.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => agentToDelete && deleteAgentMutation.mutate(agentToDelete.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('agentManagementPage.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Disable Confirmation Dialog */}
      <AlertDialog open={!!agentToDisable} onOpenChange={() => setAgentToDisable(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('agentManagementPage.disableAgent')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('agentManagementPage.disableConfirm', { name: agentToDisable?.agent_name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('agentManagementPage.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => agentToDisable && disableAgentMutation.mutate({ agentId: agentToDisable.id, disable: true })}
            >
              {t('agentManagementPage.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
