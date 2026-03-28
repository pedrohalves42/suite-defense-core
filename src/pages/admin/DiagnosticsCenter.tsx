/**
 * DiagnosticsCenter - Página consolidada de diagnósticos
 * 
 * Substitui:
 * - AgentDiagnostics.tsx
 * - AgentDiagnosticsUnified.tsx
 * - AgentTroubleshooting.tsx
 * 
 * Integrado com state machine e causalidade
 */

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import type { RpcAgentRow } from '@/types/rpc';
import { useTenant } from '@/hooks/useTenant';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { DiagnosticPanel } from '@/components/agent/DiagnosticPanel';
import { PreserveReinstallSection } from '@/components/admin/PreserveReinstallSection';
import { AgentStateExplainer } from '@/components/agent/AgentStateExplainer';
import { AgentQuickActions } from '@/components/admin/AgentQuickActions';
import { JobLiveMonitor } from '@/components/admin/JobLiveMonitor';
import { DiagnosticTestRunner } from '@/components/admin/DiagnosticTestRunner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AgentHealthAlerts } from '@/components/admin/AgentHealthAlerts';
import { DynamicValidationSystem } from '@/components/admin/DynamicValidationSystem';
import { SectionDivider } from '@/components/ui/section-divider';
import { 
  AlertCircle, 
  CheckCircle2, 
  RefreshCw, 
  Terminal, 
  Shield, 
  Download,
  Trash2, 
  Clock, 
  WifiOff, 
  Key, 
  AlertTriangle, 
  Computer,
  Stethoscope,
  Activity,
  Network,
  FileText,
  Wrench,
  Target,
  Eye,
  Wifi,
  Settings,
  Zap,
  History,
  Globe,
  XCircle
} from 'lucide-react';
import { prepareJobForInsert } from '@/lib/job-utils';
import { toast } from 'sonner';
import { formatRelativeTime } from '@/lib/date-utils';
import { getOsIcon } from '@/lib/os-utils';
import { deriveAgentState, getStateColorClasses, type AgentState } from '@/lib/agent-state-machine';

interface ProblematicAgent {
  id: string;
  agent_name: string;
  tenant_id: string;
  status: string | null;
  enrolled_at: string | null;
  last_heartbeat: string | null;
  hostname: string | null;
  os_type: string | null;
  issue_type: string | null;
  has_active_token: boolean | null;
  failed_jobs_24h?: number | null;
  is_throttled?: boolean | null;
  is_isolated?: boolean | null;
  is_in_safe_mode?: boolean | null;
}

export default function DiagnosticsCenter() {
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

  // Query all agents for list
  const { data: allAgents = [], isLoading: agentsLoading, refetch: refetchAgents } = useQuery({
    queryKey: ['diagnostics-agents', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      // ADR-026: Use RPC with explicit tenant_id to bypass JWT sync issues
      const { data, error } = await supabase.rpc('get_agents_list', {
        p_tenant_id: tenant.id,
        p_include_archived: false
      });

      if (error) throw error;
      return ((data || []) as unknown as RpcAgentRow[])
        .sort((a, b) => {
          if (!a.last_heartbeat && !b.last_heartbeat) return 0;
          if (!a.last_heartbeat) return 1;
          if (!b.last_heartbeat) return -1;
          return b.last_heartbeat.localeCompare(a.last_heartbeat);
        });
    },
    enabled: !tenantLoading && !!tenant?.id,
    refetchInterval: 300_000,
    refetchIntervalInBackground: false, // COST-OPT: 30s → 2min
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
    refetchInterval: 300_000,
    refetchIntervalInBackground: false, // COST-OPT: 30s → 2min
    enabled: !tenantLoading && !!tenant?.id,
  });

  // Query agents with recent failed jobs (not reflected in v_problematic_agents)
  const { data: agentsWithFailedJobs = [] } = useQuery({
    queryKey: ['agents-failed-jobs', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await (supabase )
        .from('jobs')
        .select('agent_name')
        .eq('tenant_id', tenant.id)
        .eq('status', 'failed')
        .gte('created_at', since);
      if (error) return [];
      // Unique agent names with failures
      const names = [...new Set((data || []).map((j: Record<string, unknown>) => j.agent_name))];
      return names as string[];
    },
    enabled: !tenantLoading && !!tenant?.id,
    refetchInterval: 300_000,
    refetchIntervalInBackground: false,
  });

  // Get selected agent data
  const selectedAgent = useMemo(() => {
    return allAgents.find(a => a.id === selectedAgentId) || null;
  }, [allAgents, selectedAgentId]);

  // Derive state for selected agent
  const selectedAgentState = useMemo(() => {
    if (!selectedAgent) return null;
    return deriveAgentState({
      is_isolated: selectedAgent.is_isolated,
      safe_mode_entered_at: selectedAgent.safe_mode_entered_at,
      last_heartbeat: selectedAgent.last_heartbeat,
      is_throttled: selectedAgent.is_throttled,
    });
  }, [selectedAgent]);

  // Cleanup single agent
  const cleanupMutation = useMutation({
    mutationFn: async (agentId: string) => {
      const { data, error } = await supabase.rpc('cleanup_problematic_agent', {
        p_agent_id: agentId
      });
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

  // Bulk cleanup
  const bulkCleanupMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('cleanup_all_problematic_agents', {
        p_tenant_id: tenant?.id
      });
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
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-reinstall-script`
      );
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

  const getIssueInfo = (issueType: string | null) => {
    switch (issueType) {
      case 'no_heartbeat':
        return { label: 'Sem Comunicação', variant: 'destructive' as const, icon: WifiOff };
      case 'stale_heartbeat':
        return { label: 'Comunicação Desatualizada', variant: 'warning' as const, icon: Clock };
      case 'no_token':
        return { label: 'Credenciais Inválidas', variant: 'destructive' as const, icon: Key };
      case 'failed_jobs':
        return { label: 'Tarefas Falhando', variant: 'warning' as const, icon: AlertTriangle };
      default:
        return { label: 'Problema Desconhecido', variant: 'secondary' as const, icon: AlertCircle };
    }
  };

  // SOC mode handler
  const handleSocModeChange = (value: string) => {
    const isSoc = value === 'soc';
    setSocMode(isSoc);
    setSearchParams(prev => {
      if (isSoc) {
        prev.set('view', 'soc');
      } else {
        prev.delete('view');
      }
      return prev;
    });
  };

  // Counts - include agents with failed jobs that aren't already in problematic list
  const problemCounts = useMemo(() => {
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

  // Filter agents based on SOC mode
  const filteredAgents = useMemo(() => {
    if (!socMode) return allAgents;
    // In SOC mode, only show agents with critical issues (no heartbeat, no token)
    return allAgents.filter(a => 
      problematicAgents.some(p => p.id === a.id && 
        (p.issue_type === 'no_heartbeat' || p.issue_type === 'no_token' || p.issue_type === 'stale_heartbeat')
      ) ||
      a.is_isolated ||
      !!a.safe_mode_entered_at
    );
  }, [allAgents, problematicAgents, socMode]);

  if (agentsLoading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-10 w-80" />
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Stethoscope className="h-6 w-6 text-primary" />
            Central de Diagnósticos
            {socMode && (
              <Badge variant="destructive" className="ml-2">
                <Target className="h-3 w-3 mr-1" />
                Modo SOC
              </Badge>
            )}
          </h1>
          <p className="text-muted-foreground mt-1">
            {socMode 
              ? 'Visualização focada em problemas críticos — ação rápida'
              : 'Identifique e resolva problemas de instalação e conectividade'
            }
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ToggleGroup 
            type="single" 
            value={socMode ? 'soc' : 'default'}
            onValueChange={handleSocModeChange}
            className="border rounded-lg p-1"
          >
            <ToggleGroupItem value="default" className="text-xs px-3">
              <Eye className="h-3.5 w-3.5 mr-1.5" />
              Completo
            </ToggleGroupItem>
            <ToggleGroupItem value="soc" className="text-xs px-3">
              <Target className="h-3.5 w-3.5 mr-1.5" />
              SOC
            </ToggleGroupItem>
          </ToggleGroup>
          <Button variant="outline" onClick={() => { refetchAgents(); refetchProblematic(); }}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card className={problemCounts.total > 0 ? 'border-destructive/30' : ''}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Com Problema</CardTitle>
            <AlertCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{problemCounts.total}</div>
            <p className="text-xs text-muted-foreground">Precisam de atenção</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Desconectados</CardTitle>
            <WifiOff className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{problemCounts.noHeartbeat}</div>
            <p className="text-xs text-muted-foreground">Sem sinal de vida</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Credenciais</CardTitle>
            <Key className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{problemCounts.noToken}</div>
            <p className="text-xs text-muted-foreground">Precisam reinstalar</p>
          </CardContent>
        </Card>

        <Card className={problemCounts.failedJobs > 0 ? 'border-amber-500/30' : ''}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Jobs Falhados</CardTitle>
            <XCircle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{problemCounts.failedJobs}</div>
            <p className="text-xs text-muted-foreground">Últimas 24h</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total</CardTitle>
            <Computer className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{allAgents.length}</div>
            <p className="text-xs text-muted-foreground">Computadores</p>
          </CardContent>
        </Card>
      </div>

      {/* Real-time Job Monitor */}
      <JobLiveMonitor showSummary={false} maxJobs={5} className="border-primary/20" />

      {/* Watchdog de Execução - Alertas de Agentes */}
      <AgentHealthAlerts />

      <SectionDivider label="Sistema de Validação" />

      {/* Dynamic Validation System */}
      <DynamicValidationSystem />

      {/* Main Content */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Agent List */}
        <Card className={`lg:col-span-1 ${socMode ? 'border-destructive/30' : ''}`}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Computer className="h-4 w-4" />
              {socMode ? 'Críticos' : 'Computadores'} ({socMode ? filteredAgents.length : allAgents.length})
            </CardTitle>
            <CardDescription>
              {socMode ? 'Apenas agentes que requerem ação imediata' : 'Clique para diagnosticar'}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[500px]">
              <div className="p-4 space-y-2">
                {/* Problematic agents first */}
                {problematicAgents.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs font-medium text-destructive mb-2 px-1">COM PROBLEMAS</p>
                    {problematicAgents.map((agent) => {
                      const issueInfo = getIssueInfo(agent.issue_type);
                      const IssueIcon = issueInfo.icon;
                      const isSelected = selectedAgentId === agent.id;
                      
                      return (
                        <button
                          key={agent.id}
                          onClick={() => setSelectedAgentId(agent.id)}
                          className={`w-full text-left p-3 rounded-lg border transition-colors mb-2 ${
                            isSelected
                              ? 'border-primary bg-primary/5'
                              : 'border-destructive/30 bg-destructive/5 hover:bg-destructive/10'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium text-sm truncate flex items-center gap-2">
                              <span>{getOsIcon(agent.os_type || 'windows')}</span>
                              {agent.agent_name}
                            </span>
                            <Badge variant={issueInfo.variant} className="text-xs">
                              <IssueIcon className="h-3 w-3 mr-1" />
                              {issueInfo.label}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {agent.hostname || 'Hostname desconhecido'}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* All other agents - hide in SOC mode */}
                {!socMode && (
                  <>
                <p className="text-xs font-medium text-muted-foreground mb-2 px-1">TODOS</p>
                {allAgents.filter(a => !problematicAgents.find(p => p.id === a.id)).map((agent) => {
                  const isSelected = selectedAgentId === agent.id;
                  const state = deriveAgentState({
                    is_isolated: agent.is_isolated,
                    safe_mode_entered_at: agent.safe_mode_entered_at,
                    last_heartbeat: agent.last_heartbeat,
                    is_throttled: agent.is_throttled,
                  });
                  const colors = getStateColorClasses(state);
                  
                  return (
                    <button
                      key={agent.id}
                      onClick={() => setSelectedAgentId(agent.id)}
                      className={`w-full text-left p-3 rounded-lg border transition-colors ${
                        isSelected
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:bg-accent/50'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-sm truncate flex items-center gap-2">
                          <span>{getOsIcon(agent.os_type || 'windows')}</span>
                          {agent.agent_name}
                        </span>
                        <div className={`w-2 h-2 rounded-full ${colors.bg}`} />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {agent.last_heartbeat ? formatRelativeTime(agent.last_heartbeat) : 'Nunca conectado'}
                      </p>
                    </button>
                  );
                })}
                  </>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Diagnostic Details */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="h-4 w-4" />
                  {selectedAgent ? selectedAgent.agent_name : 'Selecione um computador'}
                </CardTitle>
                {selectedAgent && (
                  <CardDescription>
                    {selectedAgent.hostname} • {selectedAgent.os_type || 'SO desconhecido'}
                  </CardDescription>
                )}
              </div>
              {selectedAgent && selectedAgentState && (
                <Badge variant="outline" className={`${getStateColorClasses(selectedAgentState).bg} ${getStateColorClasses(selectedAgentState).text}`}>
                  {selectedAgentState}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {!selectedAgent ? (
              <div className="text-center py-12 text-muted-foreground">
                <Computer className="h-12 w-12 mx-auto mb-4 opacity-30" />
                <p>Selecione um computador na lista para ver o diagnóstico</p>
              </div>
            ) : (
              <Tabs defaultValue="diagnostic" className="w-full">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="diagnostic" className="text-xs">
                    <AlertCircle className="h-3.5 w-3.5 mr-1" />
                    Diagnóstico
                  </TabsTrigger>
                  <TabsTrigger value="state" className="text-xs">
                    <Shield className="h-3.5 w-3.5 mr-1" />
                    Estado
                  </TabsTrigger>
                  <TabsTrigger value="guides" className="text-xs">
                    <FileText className="h-3.5 w-3.5 mr-1" />
                    Guias
                  </TabsTrigger>
                  <TabsTrigger value="tools" className="text-xs">
                    <Wrench className="h-3.5 w-3.5 mr-1" />
                    Ferramentas
                  </TabsTrigger>
                </TabsList>

                {/* Diagnostic Tab */}
                <TabsContent value="diagnostic" className="mt-4">
                  <DiagnosticPanel
                    agentId={selectedAgent.id}
                    agentName={selectedAgent.agent_name}
                    tenantId={selectedAgent.tenant_id}
                    agentState={selectedAgentState}
                    variant="full"
                    intent={socMode ? 'soc' : 'triage'}
                  />
                </TabsContent>

                {/* State Tab */}
                <TabsContent value="state" className="mt-4 space-y-4">
                  <AgentStateExplainer agentId={selectedAgent.id} tenantId={selectedAgent.tenant_id} />
                  
                  <div className="pt-4 border-t">
                    <h4 className="text-sm font-medium mb-3">Ações Rápidas</h4>
                    <TooltipProvider>
                      <AgentQuickActions
                        agentId={selectedAgent.id}
                        agentName={selectedAgent.agent_name}
                        isThrottled={selectedAgent.is_throttled}
                        isIsolated={selectedAgent.is_isolated}
                        isInSafeMode={!!selectedAgent.safe_mode_entered_at}
                      />
                    </TooltipProvider>
                  </div>
                </TabsContent>

                {/* Guides Tab */}
                <TabsContent value="guides" className="mt-4">
                  <Accordion type="single" collapsible className="w-full">
                    <AccordionItem value="item-1">
                      <AccordionTrigger>
                        <span className="flex items-center gap-2 text-sm">
                          <WifiOff className="h-4 w-4 text-destructive" />
                          Computador não aparece após instalação
                        </span>
                      </AccordionTrigger>
                      <AccordionContent className="space-y-3 text-sm">
                        <p className="font-semibold">Possíveis Causas:</p>
                        <ul className="list-disc pl-6 space-y-1">
                          <li>Credenciais inválidas (Token ou HMAC expirado)</li>
                          <li>Firewall bloqueando conexão na porta 443</li>
                          <li>Proxy corporativo sem configuração adequada</li>
                          <li>Tarefa agendada não foi criada</li>
                        </ul>
                        <p className="font-semibold mt-4">Solução:</p>
                        <ol className="list-decimal pl-6 space-y-1">
                          <li>Verifique os logs: <code className="bg-muted px-2 py-1 rounded text-xs">C:\CyberShield\logs\agent.log</code></li>
                          <li>Teste conectividade: <code className="bg-muted px-2 py-1 rounded text-xs">Test-NetConnection -Port 443</code></li>
                          <li>Se necessário, reinstale com novo instalador</li>
                        </ol>
                      </AccordionContent>
                    </AccordionItem>

                    <AccordionItem value="item-2">
                      <AccordionTrigger>
                        <span className="flex items-center gap-2 text-sm">
                          <Clock className="h-4 w-4 text-warning" />
                          Computador ficou offline após funcionar
                        </span>
                      </AccordionTrigger>
                      <AccordionContent className="space-y-3 text-sm">
                        <p className="font-semibold">Possíveis Causas:</p>
                        <ul className="list-disc pl-6 space-y-1">
                          <li>Tarefa agendada foi parada manualmente</li>
                          <li>Servidor reiniciou e tarefa não iniciou</li>
                          <li>Rate limiting por envios excessivos</li>
                          <li>Atualização de agente falhou</li>
                        </ul>
                        <p className="font-semibold mt-4">Solução:</p>
                        <ol className="list-decimal pl-6 space-y-1">
                          <li>Verifique tarefa: <code className="bg-muted px-2 py-1 rounded text-xs">Get-ScheduledTask -TaskName "CyberShield*"</code></li>
                          <li>Reinicie manualmente se necessário</li>
                          <li>Verifique se há throttling ativo</li>
                        </ol>
                      </AccordionContent>
                    </AccordionItem>

                    <AccordionItem value="item-3">
                      <AccordionTrigger>
                        <span className="flex items-center gap-2 text-sm">
                          <Key className="h-4 w-4 text-destructive" />
                          Erro de autenticação / Credenciais inválidas
                        </span>
                      </AccordionTrigger>
                      <AccordionContent className="space-y-3 text-sm">
                        <p className="font-semibold">Causa:</p>
                        <p>O token ou HMAC do agente não corresponde aos registros no servidor.</p>
                        <p className="font-semibold mt-4">Solução:</p>
                        <ol className="list-decimal pl-6 space-y-1">
                          <li>Gere um novo instalador para este computador</li>
                          <li>Desinstale o agente antigo</li>
                          <li>Execute o novo instalador</li>
                        </ol>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </TabsContent>

                {/* Tools Tab */}
                <TabsContent value="tools" className="mt-4 space-y-4">
                  {/* Remote Diagnostic Tools */}
                  <div className="mb-4">
                    <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                      <Wifi className="h-4 w-4" />
                      Diagnóstico Remoto
                    </h4>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <Activity className="h-4 w-4 text-green-500" />
                            Testar Conectividade
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-xs text-muted-foreground mb-3">
                            Envia ping ao agente para confirmar comunicação
                          </p>
                          <Button 
                            size="sm" 
                            onClick={async () => {
                              if (!selectedAgent || !tenant?.id) return;
                              const job = await prepareJobForInsert({
                                tenant_id: tenant.id,
                                agent_id: selectedAgent.id,
                                agent_name: selectedAgent.agent_name,
                                type: 'ping',
                                status: 'queued',
                                payload: { source: 'diagnostics_center' },
                              });
                              await supabase.from('jobs').insert(job);
                              toast.success('Ping enviado! Aguarde resultado.');
                            }}
                          >
                            <Zap className="h-3 w-3 mr-2" />
                            Testar Agora
                          </Button>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <FileText className="h-4 w-4 text-blue-500" />
                            Coletar Logs
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-xs text-muted-foreground mb-3">
                            Solicita upload dos logs das últimas 24h
                          </p>
                          <Button 
                            size="sm" 
                            onClick={async () => {
                              if (!selectedAgent || !tenant?.id) return;
                              const job = await prepareJobForInsert({
                                tenant_id: tenant.id,
                                agent_id: selectedAgent.id,
                                agent_name: selectedAgent.agent_name,
                                type: 'collect_logs',
                                status: 'queued',
                                payload: { source: 'diagnostics_center', period: '24h' },
                              });
                              await supabase.from('jobs').insert(job);
                              toast.success('Coleta de logs solicitada!');
                            }}
                          >
                            <Download className="h-3 w-3 mr-2" />
                            Solicitar Logs
                          </Button>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <Settings className="h-4 w-4 text-purple-500" />
                            Verificar Serviços
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-xs text-muted-foreground mb-3">
                            Lista status dos componentes do agente
                          </p>
                          <Button 
                            size="sm" 
                            onClick={async () => {
                              if (!selectedAgent || !tenant?.id) return;
                              const job = await prepareJobForInsert({
                                tenant_id: tenant.id,
                                agent_id: selectedAgent.id,
                                agent_name: selectedAgent.agent_name,
                                type: 'check_services',
                                status: 'queued',
                                payload: { source: 'diagnostics_center' },
                              });
                              await supabase.from('jobs').insert(job);
                              toast.success('Verificação de serviços iniciada!');
                            }}
                          >
                            <CheckCircle2 className="h-3 w-3 mr-2" />
                            Verificar
                          </Button>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <RefreshCw className="h-4 w-4 text-orange-500" />
                            Forçar Health Report
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-xs text-muted-foreground mb-3">
                            Solicita métricas atualizadas imediatamente
                          </p>
                          <Button 
                            size="sm" 
                            onClick={async () => {
                              if (!selectedAgent || !tenant?.id) return;
                              const job = await prepareJobForInsert({
                                tenant_id: tenant.id,
                                agent_id: selectedAgent.id,
                                agent_name: selectedAgent.agent_name,
                                type: 'health_report',
                                status: 'queued',
                                payload: { source: 'diagnostics_center', priority: 'high' },
                              });
                              await supabase.from('jobs').insert(job);
                              toast.success('Relatório de saúde solicitado!');
                            }}
                          >
                            <Zap className="h-3 w-3 mr-2" />
                            Executar
                          </Button>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <Globe className="h-4 w-4 text-cyan-500" />
                            Testar DNS
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-xs text-muted-foreground mb-3">
                            Verifica resolução de nomes do agente
                          </p>
                          <Button 
                            size="sm" 
                            onClick={async () => {
                              if (!selectedAgent || !tenant?.id) return;
                              const job = await prepareJobForInsert({
                                tenant_id: tenant.id,
                                agent_id: selectedAgent.id,
                                agent_name: selectedAgent.agent_name,
                                type: 'test_dns',
                                status: 'queued',
                                payload: { source: 'diagnostics_center', targets: ['google.com', 'microsoft.com'] },
                              });
                              await supabase.from('jobs').insert(job);
                              toast.success('Teste de DNS iniciado!');
                            }}
                          >
                            <Network className="h-3 w-3 mr-2" />
                            Testar
                          </Button>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <History className="h-4 w-4 text-indigo-500" />
                            Histórico Heartbeats
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-xs text-muted-foreground mb-3">
                            Últimos 50 heartbeats com latência
                          </p>
                          <Button 
                            size="sm" 
                            onClick={() => {
                              navigate(`/admin/agent-timeline?agent=${selectedAgentId}`);
                            }}
                          >
                            <Clock className="h-3 w-3 mr-2" />
                            Ver Histórico
                          </Button>
                        </CardContent>
                      </Card>
                    </div>
                  </div>

                  {/* Test Battery Section */}
                  <div className="mb-6">
                    <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                      <Stethoscope className="h-4 w-4" />
                      Bateria de Testes
                    </h4>
                    <Card className="border-dashed">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Stethoscope className="h-4 w-4 text-primary" />
                          Testar Todas as Ferramentas
                        </CardTitle>
                        <CardDescription>
                          Execute uma sequência de testes para verificar as ferramentas de diagnóstico
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <DiagnosticTestRunner 
                          agentId={selectedAgentId} 
                          agentName={selectedAgent?.agent_name}
                          onComplete={() => queryClient.invalidateQueries({ queryKey: ['jobs'] })}
                        />
                      </CardContent>
                    </Card>
                  </div>

                  {/* Preserve Reinstall Section - RECOMMENDED */}
                  <div className="mb-6">
                    <PreserveReinstallSection defaultAgentName={selectedAgent?.agent_name ?? null} />
                  </div>

                  {/* Original Tools */}
                  <div>
                    <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                      <Wrench className="h-4 w-4" />
                      Reinstalação Limpa (novo registro)
                    </h4>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <Download className="h-4 w-4" />
                            Script de Reinstalação
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-xs text-muted-foreground mb-3">
                            Script PowerShell para reinstalar o agente remotamente
                          </p>
                          <Button size="sm" onClick={handleDownloadReinstallScript}>
                            <Download className="h-3 w-3 mr-2" />
                            Baixar Script
                          </Button>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <Trash2 className="h-4 w-4 text-destructive" />
                            Limpar Registro
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-xs text-muted-foreground mb-3">
                            Remove registros problemáticos para permitir nova instalação
                          </p>
                          <Button 
                            size="sm" 
                            variant="destructive"
                            onClick={() => {
                              const probAgent = problematicAgents.find(a => a.id === selectedAgentId);
                              if (probAgent) setAgentToCleanup(probAgent);
                              else toast.info('Este computador não está na lista de problemáticos');
                            }}
                          >
                            <Trash2 className="h-3 w-3 mr-2" />
                            Limpar e Resetar
                          </Button>
                        </CardContent>
                      </Card>
                    </div>
                  </div>

                  {/* Bulk cleanup */}
                  {problematicAgents.length > 1 && (
                    <Card className="border-destructive/50">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2 text-destructive">
                          <Trash2 className="h-4 w-4" />
                          Limpeza em Massa
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-xs text-muted-foreground mb-3">
                          Remove todos os {problematicAgents.length} computadores problemáticos de uma vez
                        </p>
                        <Button 
                          size="sm" 
                          variant="destructive"
                          onClick={() => setShowBulkCleanupDialog(true)}
                        >
                          Limpar Todos ({problematicAgents.length})
                        </Button>
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Cleanup Dialog */}
      <AlertDialog open={!!agentToCleanup} onOpenChange={() => setAgentToCleanup(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Limpeza</AlertDialogTitle>
            <AlertDialogDescription>
              Isso irá remover o registro de "{agentToCleanup?.agent_name}" e permitir uma nova instalação. 
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => agentToCleanup && cleanupMutation.mutate(agentToCleanup.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cleanupMutation.isPending ? 'Limpando...' : 'Confirmar Limpeza'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Cleanup Dialog */}
      <AlertDialog open={showBulkCleanupDialog} onOpenChange={setShowBulkCleanupDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Limpeza em Massa</AlertDialogTitle>
            <AlertDialogDescription>
              Isso irá remover os registros de {problematicAgents.length} computadores problemáticos. 
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => bulkCleanupMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {bulkCleanupMutation.isPending ? 'Limpando...' : `Limpar ${problematicAgents.length} Computadores`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
