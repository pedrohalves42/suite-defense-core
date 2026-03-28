import { useState, useEffect, useCallback } from "react";
import { Zap, Plus, Server, CheckCircle, XCircle, Clock, AlertCircle, Trash2, Sparkles } from "lucide-react";
import { JobCleanupDialog } from "@/components/jobs/JobCleanupDialog";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import type { RpcAgentRow } from '@/types/rpc';
import { toast } from "sonner";
import { formatBrazilDateTime } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { useMutation } from "@tanstack/react-query";
import { getJobTypeLabel, getJobStatusLabel, JOB_TYPE_LABELS } from "@/lib/job-labels";
import { getAgentDisplayName } from "@/lib/agent-utils";
import { useActiveTenant } from "@/hooks/useActiveTenant";

interface Agent {
  id: string;
  agent_name: string;
  hostname: string | null;
  display_name: string | null;
  status: string;
  last_heartbeat: string | null;
}

interface Job {
  id: string;
  agent_name: string;
  type: string;
  status: string;
  created_at: string;
  approved: boolean;
  payload: any;
  scheduled_at?: string | null;
  is_recurring?: boolean;
  recurrence_pattern?: string | null;
  next_run_at?: string | null;
  last_run_at?: string | null;
}

const JobCreator = () => {
  const { activeTenant: tenant, loading: tenantLoading } = useActiveTenant();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [recentJobs, setRecentJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [latestVersion, setLatestVersion] = useState<string>("v3.10.35-OPTIMIZED-INTERVALS");

  // Form state
  const [selectedAgent, setSelectedAgent] = useState<string>("");
  const [jobType, setJobType] = useState<string>("scan");
  const [payload, setPayload] = useState<string>("{}");
  const [approved, setApproved] = useState<boolean>(true);
  const [isScheduled, setIsScheduled] = useState<boolean>(false);
  const [scheduledAt, setScheduledAt] = useState<string>("");
  const [isRecurring, setIsRecurring] = useState<boolean>(false);
  const [recurrencePattern, setRecurrencePattern] = useState<string>("0 * * * *");

  const loadAgents = useCallback(async () => {
    if (!tenant?.id || tenantLoading) return;
    try {
      // ADR-026: Use RPC with explicit tenant_id to bypass JWT sync issues
      const { data, error } = await supabase.rpc('get_agents_list', {
        p_tenant_id: tenant.id,
        p_include_archived: false
      });

      if (error) throw error;
      const mapped = ((data || []) as unknown as RpcAgentRow[]).map((agent): Agent => ({
        id: agent.id,
        agent_name: agent.agent_name,
        hostname: agent.hostname,
        display_name: agent.display_name,
        status: agent.status,
        last_heartbeat: agent.last_heartbeat,
      })).sort((a, b) => a.agent_name.localeCompare(b.agent_name));
      setAgents(mapped);
    } catch (error) {
      logger.error("Erro ao carregar agentes", error);
      toast.error("Erro ao carregar lista de agentes");
    }
  }, [tenant?.id, tenantLoading]);

  const loadJobs = useCallback(async () => {
    try {
      // Buscar user_id autenticado
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user?.id) {
        logger.warn("Usuário não autenticado");
        setRecentJobs([]);
        return;
      }

      // Buscar tenant do usuário usando user_id explícito
      const { data: userRoles, error: roleError } = await supabase
        .from("user_roles")
        .select("tenant_id")
        .eq('user_id', user.id)
        .limit(1)
        .single();

      if (roleError || !userRoles?.tenant_id) {
        logger.warn("Tenant não encontrado para usuário", { userId: user.id, error: roleError });
        setRecentJobs([]);
        return;
      }

      // Usar RPC para garantir acesso correto via SECURITY DEFINER
      const { data, error } = await supabase
        .rpc('get_recent_jobs', { 
          p_tenant_id: userRoles.tenant_id,
          p_limit: 50 
        });

      if (error) throw error;
      
      logger.info('[JobCreator] Jobs carregados', { count: data?.length || 0, tenantId: userRoles.tenant_id });
      setRecentJobs(data || []);
    } catch (error) {
      logger.error("Erro ao carregar jobs", error);
    }
  }, []);

  const loadLatestVersion = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("agent_releases_public")
        .select("version")
        .eq("platform", "windows")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (data?.version) {
        setLatestVersion(data.version);
        logger.info("Versão mais recente carregada", { version: data.version });
      }
    } catch (error) {
      logger.warn("Erro ao carregar versão mais recente, usando fallback", error);
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoadingData(true);
    await Promise.all([loadAgents(), loadJobs(), loadLatestVersion()]);
    setLoadingData(false);
  }, [loadAgents, loadJobs, loadLatestVersion]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Realtime subscription with tenant filter
  useEffect(() => {
    if (!tenant?.id) return;
    
    const jobsChannel = supabase
      .channel(`jobs-creator-${tenant.id}`)
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'jobs',
        filter: `tenant_id=eq.${tenant.id}`
      }, () => {
        loadJobs();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(jobsChannel);
    };
  }, [tenant?.id, loadJobs]);

  const clearPendingJobs = useMutation({
    mutationFn: async () => {
      if (!tenant?.id) throw new Error("Tenant não encontrado");
      // Fix: Use 1h threshold instead of 24h, and filter by tenant
      const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
      const { error } = await supabase
        .from('jobs')
        .delete()
        .eq('tenant_id', tenant.id)
        .eq('status', 'queued')
        .lt('created_at', oneHourAgo);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tarefas pendentes limpas com sucesso");
      loadJobs();
    },
    onError: (error: Record<string, unknown>) => {
      toast.error(`Erro ao limpar tarefas: ${error.message}`);
    }
  });

  const handleClearPendingJobs = () => {
    const pendingCount = recentJobs.filter(j => j.status === 'queued').length;
    
    if (pendingCount === 0) {
      toast.info("Não há tarefas pendentes para limpar");
      return;
    }
    
    if (confirm(`Limpar tarefas pendentes há mais de 1 hora? (${pendingCount} na fila atualmente)`)) {
      clearPendingJobs.mutate();
    }
  };

  const getJobTypeExamples = useCallback((type: string) => {
    const examples: Record<string, any> = {
      scan: {
        filePath: "C:\\Windows\\System32",
        recursive: true,
        extensions: [".exe", ".dll", ".bat"]
      },
      update: {
        target_version: latestVersion,
        force: false
      },
      report: {
        type: "security_report",
        include_software: true,
        include_vulnerabilities: true,
        include_antivirus: true
      },
      config: {
        polling_interval: 60,
        enable_auto_update: true
      },
      software_inventory_collect: {},
      collect_antivirus_status: {},
      collect_web_activity: {},
      light_vuln_scan: {}
    };
    return JSON.stringify(examples[type] || {}, null, 2);
  }, [latestVersion]);

  // Atualiza payload quando a versão muda e o tipo é update
  useEffect(() => {
    if (jobType === "update") {
      setPayload(getJobTypeExamples("update"));
    }
  }, [latestVersion, jobType, getJobTypeExamples]);

  const handleJobTypeChange = (newType: string) => {
    setJobType(newType);
    setPayload(getJobTypeExamples(newType));
  };

  const createJob = async () => {
    if (!selectedAgent) {
      toast.error("Selecione um agente");
      return;
    }

    if (!jobType) {
      toast.error("Selecione um tipo de job");
      return;
    }

    if (isScheduled && !scheduledAt) {
      toast.error("Defina a data e hora do agendamento");
      return;
    }

    if (isRecurring && !recurrencePattern) {
      toast.error("Selecione um padrao de recorrencia");
      return;
    }

    let parsedPayload;
    try {
      parsedPayload = JSON.parse(payload);
    } catch (error) {
      toast.error("Payload JSON invalido");
      return;
    }

    // Validação específica para jobs tipo "scan": filePath é obrigatório
    if (jobType === "scan" && (!parsedPayload.filePath || parsedPayload.filePath.trim() === "")) {
      toast.error("O campo 'filePath' é obrigatório para jobs de scan. Informe o caminho completo do arquivo.");
      return;
    }

    setLoading(true);
    try {
      const requestBody: any = {
        agentName: selectedAgent,
        type: jobType,
        payload: parsedPayload,
        approved
      };

      if (isScheduled && scheduledAt) {
        requestBody.scheduledAt = new Date(scheduledAt).toISOString();
      }

      if (isRecurring) {
        requestBody.isRecurring = true;
        requestBody.recurrencePattern = recurrencePattern;
      }

      const { data, error } = await supabase.functions.invoke('create-job', {
        body: requestBody
      });

      if (error) {
        // Handle structured error responses
        const errorData = typeof error === 'object' && 'error' in error ? error.error : error;
        const errorCode = errorData?.code;
        const errorMessage = errorData?.message || error.message || "Erro ao criar job";

        if (errorCode === 'FORBIDDEN') {
          toast.error("Acesso negado. E necessario ter papel admin, operator ou super_admin no tenant do agente.");
        } else if (errorCode === 'AGENT_NOT_FOUND') {
          toast.error("Agente nao encontrado ou nao pertence ao tenant selecionado.");
        } else if (errorCode === 'TENANT_NOT_FOUND') {
          toast.error("Tenant nao encontrado. Verifique suas permissoes.");
        } else {
          toast.error(errorMessage);
        }
        
        logger.error("Erro ao criar job", { error, errorCode, errorMessage });
        return;
      }

      const jobTypeLabel = isRecurring ? 'Tarefa recorrente' : isScheduled ? 'Tarefa agendada' : 'Tarefa';
      toast.success(`${jobTypeLabel} criada com sucesso!`);
      
      // Reset form
      setPayload(getJobTypeExamples(jobType));
      setIsScheduled(false);
      setScheduledAt("");
      setIsRecurring(false);
      
      // Reload jobs
      loadJobs();
    } catch (error: unknown) {
      logger.error("Erro inesperado ao criar job", error);
      toast.error("Erro inesperado ao criar job. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { color: string; icon: any }> = {
      queued: { color: "bg-warning/20 text-warning border-warning/30", icon: Clock },
      delivered: { color: "bg-primary/20 text-primary border-primary/30", icon: Server },
      completed: { color: "bg-success/20 text-success border-success/30", icon: CheckCircle },
      failed: { color: "bg-destructive/20 text-destructive border-destructive/30", icon: XCircle }
    };

    const variant = variants[status] || variants.queued;
    const Icon = variant.icon;

    return (
      <Badge variant="outline" className={`${variant.color} gap-1`}>
        <Icon className="h-3 w-3" />
        {getJobStatusLabel(status)}
      </Badge>
    );
  };

  const activeAgents = agents.filter(a => {
    if (!a.last_heartbeat) return false;
    const lastHeartbeat = new Date(a.last_heartbeat);
    return (new Date().getTime() - lastHeartbeat.getTime()) < 30 * 60 * 1000; // 30min - matches AGENT_STATUS_THRESHOLDS
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-cyber rounded-xl border border-primary/20 shadow-glow-primary">
            <Zap className="h-8 w-8 text-primary animate-pulse-glow" />
          </div>
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Central de Tarefas
            </h1>
            <p className="text-sm text-muted-foreground">Crie e gerencie tarefas para os computadores</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <JobCleanupDialog onCleanupComplete={loadJobs} />
          <Button
            onClick={handleClearPendingJobs}
            disabled={clearPendingJobs.isPending}
            variant="outline"
            className="gap-2"
          >
            <Trash2 className="h-4 w-4" />
            {clearPendingJobs.isPending ? "Limpando..." : "Limpar Pendentes"}
          </Button>
        </div>
      </div>

      {/* Estado Global */}
      {(() => {
        const pendingJobs = recentJobs.filter(j => j.status === 'queued').length;
        const completedJobs = recentJobs.filter(j => j.status === 'completed').length;
        const failedJobs = recentJobs.filter(j => j.status === 'failed').length;
        
        return (
          <Card className={cn(
            "border-2 transition-all",
            pendingJobs === 0 && failedJobs === 0 
              ? "bg-success/5 border-success/30" 
              : failedJobs > 0 
                ? "bg-destructive/5 border-destructive/30"
                : pendingJobs > 5 
                  ? "bg-warning/5 border-warning/30" 
                  : "bg-primary/5 border-primary/30"
          )}>
            <CardContent className="py-6">
              <div className="flex items-center justify-center gap-4">
                <div className="text-5xl">
                  {pendingJobs === 0 && failedJobs === 0 ? '🟢' : 
                   failedJobs > 0 ? '🔴' :
                   pendingJobs > 5 ? '🟡' : '🔵'}
                </div>
                <div className="text-center">
                  <h2 className="text-2xl font-bold">
                    {pendingJobs === 0 && failedJobs === 0 
                      ? 'Todas as Tarefas em Dia' 
                      : failedJobs > 0
                        ? `${failedJobs} Tarefa(s) com Erro`
                        : pendingJobs > 5 
                          ? `${pendingJobs} Tarefas Aguardando` 
                          : 'Sistema Operando Normalmente'}
                  </h2>
                  <p className="text-muted-foreground">
                    {activeAgents.length} de {agents.length} computadores online • {completedJobs} tarefas concluídas
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className={cn(
          "bg-gradient-card transition-all",
          activeAgents.length === agents.length && agents.length > 0
            ? "border-success/30"
            : activeAgents.length / agents.length >= 0.8
              ? "border-primary/20"
              : "border-warning/30"
        )}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Server className="h-4 w-4" />
              Computadores
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">{agents.length}</div>
            <p className={cn(
              "text-xs mt-1",
              activeAgents.length === agents.length && agents.length > 0
                ? "text-success"
                : "text-muted-foreground"
            )}>
              {activeAgents.length === agents.length && agents.length > 0 
                ? `✓ Todos online (${activeAgents.length})`
                : `${activeAgents.length} online`}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-card border-accent/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              Tarefas Recentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">{recentJobs.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              últimas 20 tarefas
            </p>
          </CardContent>
        </Card>

        <Card className={cn(
          "bg-gradient-card transition-all",
          recentJobs.filter(j => j.status === 'queued').length === 0
            ? "border-success/30"
            : recentJobs.filter(j => j.status === 'queued').length > 5
              ? "border-warning/30"
              : "border-primary/20"
        )}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Pendentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(() => {
              const pending = recentJobs.filter(j => j.status === 'queued').length;
              return (
                <>
                  <div className="text-3xl font-bold text-foreground">{pending}</div>
                  <p className={cn(
                    "text-xs mt-1",
                    pending === 0 ? "text-success" : "text-muted-foreground"
                  )}>
                    {pending === 0 ? '✓ Nenhuma pendente' : 'aguardando execução'}
                  </p>
                </>
              );
            })()}
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="create" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="create">Criar Tarefa</TabsTrigger>
          <TabsTrigger value="history">Histórico</TabsTrigger>
        </TabsList>

        {/* Create Job Tab */}
        <TabsContent value="create" className="mt-4">
          <Card className="bg-gradient-card border-primary/20">
            <CardHeader>
              <CardTitle>Nova Tarefa</CardTitle>
              <CardDescription>
                Configure e inicie uma nova tarefa para um computador
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {loadingData ? (
                <p className="text-center text-muted-foreground py-8">Carregando...</p>
              ) : (
                <>
                  {/* Agent Selection */}
                  <div className="space-y-2">
                    <Label htmlFor="agent">Computador</Label>
                    <Select value={selectedAgent} onValueChange={setSelectedAgent}>
                      <SelectTrigger id="agent">
                        <SelectValue placeholder="Selecione um computador" />
                      </SelectTrigger>
                      <SelectContent>
                        {agents.length === 0 ? (
                          <SelectItem value="none" disabled>
                            Nenhum computador disponível
                          </SelectItem>
                        ) : (
                          agents.map((agent) => {
                            const isOnline = activeAgents.some(a => a.id === agent.id);
                            const displayName = getAgentDisplayName(agent);
                            return (
                              <SelectItem key={agent.id} value={agent.agent_name}>
                                <div className="flex items-center gap-2">
                                  <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-success' : 'bg-muted'}`} />
                                  {displayName}
                                </div>
                              </SelectItem>
                            );
                          })
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Job Type */}
                  <div className="space-y-2">
                    <Label htmlFor="type">Tipo de Tarefa</Label>
                    <Select value={jobType} onValueChange={handleJobTypeChange}>
                      <SelectTrigger id="type">
                        <SelectValue placeholder="Selecione o tipo" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(JOB_TYPE_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Payload - Hidden by default with toggle */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="payload">Configurações da Tarefa</Label>
                      <Badge variant="outline" className="text-xs">
                        Preenchimento automático
                      </Badge>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg border text-sm">
                      <p className="text-muted-foreground">
                        As configurações são preenchidas automaticamente com base no tipo de tarefa selecionado.
                      </p>
                    </div>
                    <details className="group">
                      <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
                        ⚙️ Configurações detalhadas (opcional)
                      </summary>
                      <Textarea
                        id="payload"
                        value={payload}
                        onChange={(e) => setPayload(e.target.value)}
                        placeholder='{"key": "value"}'
                        className="font-mono text-sm min-h-[150px] mt-2"
                      />
                    </details>
                  </div>

                  {/* Schedule Switch */}
                  <div className="flex items-center justify-between p-4 bg-secondary/30 rounded-lg border border-border">
                    <div className="space-y-0.5">
                      <Label htmlFor="scheduled">⏰ Agendar para Depois</Label>
                      <p className="text-xs text-muted-foreground">
                        Tarefa será executada em uma data e hora específica
                      </p>
                    </div>
                    <Switch
                      id="scheduled"
                      checked={isScheduled}
                      onCheckedChange={(checked) => {
                        setIsScheduled(checked);
                        if (!checked) setScheduledAt("");
                        if (checked) setIsRecurring(false); // Can't be both scheduled and recurring
                      }}
                    />
                  </div>

                  {/* Scheduled Date/Time */}
                  {isScheduled && (
                    <div className="space-y-2">
                      <Label htmlFor="scheduledAt">Data e Hora</Label>
                      <Input
                        id="scheduledAt"
                        type="datetime-local"
                        value={scheduledAt}
                        onChange={(e) => setScheduledAt(e.target.value)}
                        min={new Date().toISOString().slice(0, 16)}
                        className="font-mono"
                      />
                      <p className="text-xs text-muted-foreground">
                        Tarefa será executada automaticamente neste horário
                      </p>
                    </div>
                  )}

                  {/* Recurring Switch */}
                  <div className="flex items-center justify-between p-4 bg-secondary/30 rounded-lg border border-border">
                    <div className="space-y-0.5">
                      <Label htmlFor="recurring">🔄 Tarefa Recorrente</Label>
                      <p className="text-xs text-muted-foreground">
                        Tarefa será executada automaticamente em intervalos regulares
                      </p>
                    </div>
                    <Switch
                      id="recurring"
                      checked={isRecurring}
                      onCheckedChange={(checked) => {
                        setIsRecurring(checked);
                        if (checked) setIsScheduled(false); // Can't be both scheduled and recurring
                      }}
                    />
                  </div>

                  {/* Recurrence Pattern */}
                  {isRecurring && (
                    <div className="space-y-2">
                      <Label htmlFor="recurrence">Padrao de Recorrencia</Label>
                      <Select value={recurrencePattern} onValueChange={setRecurrencePattern}>
                        <SelectTrigger id="recurrence">
                          <SelectValue placeholder="Selecione a frequencia" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="*/5 * * * *">A cada 5 minutos</SelectItem>
                          <SelectItem value="*/15 * * * *">A cada 15 minutos</SelectItem>
                          <SelectItem value="*/30 * * * *">A cada 30 minutos</SelectItem>
                          <SelectItem value="0 * * * *">A cada hora (no minuto :00)</SelectItem>
                          <SelectItem value="0 0 * * *">Diariamente (meia-noite)</SelectItem>
                          <SelectItem value="0 0 * * 0">Semanalmente (domingo meia-noite)</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Primeira execução ocorrerá no próximo intervalo
                      </p>
                    </div>
                  )}

                  {/* Approved Switch */}
                  <div className="flex items-center justify-between p-4 bg-secondary/30 rounded-lg border border-border">
                    <div className="space-y-0.5">
                      <Label htmlFor="approved">✅ Execução Imediata</Label>
                      <p className="text-xs text-muted-foreground">
                        Tarefa será executada assim que o computador buscar
                      </p>
                    </div>
                    <Switch
                      id="approved"
                      checked={approved}
                      onCheckedChange={setApproved}
                    />
                  </div>

                  {/* Submit Button */}
                  <Button
                    onClick={createJob}
                    disabled={loading || !selectedAgent}
                    className="w-full h-12"
                    size="lg"
                  >
                    {loading ? (
                      <>
                        <Clock className="mr-2 h-5 w-5 animate-spin" />
                        Criando Tarefa...
                      </>
                    ) : (
                      <>
                        <Plus className="mr-2 h-5 w-5" />
                        Criar Tarefa
                      </>
                    )}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="mt-4">
          <Card className="bg-gradient-card border-accent/20">
            <CardHeader>
              <CardTitle>Histórico de Tarefas</CardTitle>
              <CardDescription>
                Últimas 50 tarefas criadas no sistema
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingData ? (
                <p className="text-center text-muted-foreground py-8">Carregando...</p>
              ) : recentJobs.length === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle className="h-12 w-12 text-success mx-auto mb-4 opacity-70" />
                  <p className="text-lg font-medium">Nenhuma tarefa criada ainda</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Crie sua primeira tarefa na aba "Criar Tarefa" para começar
                  </p>
                  <Button className="mt-4" variant="default" onClick={() => {
                    const tabElement = document.querySelector('[data-state="inactive"][value="create"]');
                    if (tabElement) (tabElement as HTMLElement).click();
                  }}>
                    <Plus className="mr-2 h-4 w-4" /> Criar Primeira Tarefa
                  </Button>
                </div>
              ) : (
                <div className="space-y-3 max-h-[600px] overflow-y-auto">
                  {recentJobs.map((job) => (
                    <div
                      key={job.id}
                      className="flex items-center justify-between p-4 bg-card border rounded-lg hover:bg-accent/5 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {getStatusBadge(job.status)}
                          <span className="font-medium truncate">{getAgentDisplayName({ agent_name: job.agent_name } as never)}</span>
                        </div>
                        <div className="flex items-center gap-3 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Zap className="h-3 w-3" />
                            {getJobTypeLabel(job.type)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatBrazilDateTime(job.created_at, 'short')}
                          </span>
                          {job.is_recurring && (
                            <Badge variant="outline" className="text-xs">
                              🔄 Recorrente
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Frase Âncora de Confiança */}
      <Card className="bg-muted/20 border-dashed">
        <CardContent className="py-4 text-center">
          <p className="text-sm text-muted-foreground">
            💡 As tarefas são enviadas automaticamente quando o computador se conecta.
            <br />
            <span className="text-primary font-medium">O status atualiza em tempo real.</span>
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default JobCreator;
