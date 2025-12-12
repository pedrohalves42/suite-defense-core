import { useState, useEffect, useCallback } from "react";
import { Zap, Plus, Server, CheckCircle, XCircle, Clock, AlertCircle, Trash2 } from "lucide-react";
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
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { useMutation } from "@tanstack/react-query";
import { getJobTypeLabel, getJobStatusLabel, JOB_TYPE_LABELS } from "@/lib/job-labels";

interface Agent {
  id: string;
  agent_name: string;
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
    try {
      const { data, error } = await supabase
        .from("agents_safe")
        .select("*")
        .order("agent_name", { ascending: true });

      if (error) throw error;
      setAgents(data || []);
    } catch (error) {
      logger.error("Erro ao carregar agentes", error);
      toast.error("Erro ao carregar lista de agentes");
    }
  }, []);

  const loadJobs = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("jobs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw error;
      setRecentJobs(data || []);
    } catch (error) {
      logger.error("Erro ao carregar jobs", error);
    }
  }, []);

  const loadLatestVersion = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("agent_releases")
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
    
    // Realtime subscription
    const jobsChannel = supabase
      .channel('jobs-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'jobs' }, () => {
        loadJobs();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(jobsChannel);
    };
  }, [loadData, loadJobs]);

  const clearPendingJobs = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('jobs')
        .delete()
        .eq('status', 'queued')
        .lt('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Jobs pendentes limpos com sucesso");
      loadJobs();
    },
    onError: (error: any) => {
      toast.error(`Erro ao limpar jobs: ${error.message}`);
    }
  });

  const handleClearPendingJobs = () => {
    const pendingCount = recentJobs.filter(j => j.status === 'queued').length;
    
    if (pendingCount === 0) {
      toast.info("Nao ha jobs pendentes para limpar");
      return;
    }
    
    if (confirm(`Limpar ${pendingCount} job(s) pendente(s) com mais de 24h?`)) {
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

      const jobTypeLabel = isRecurring ? 'Job recorrente' : isScheduled ? 'Job agendado' : 'Job';
      toast.success(`${jobTypeLabel} criado com sucesso! ID: ${data.id}`);
      
      // Reset form
      setPayload(getJobTypeExamples(jobType));
      setIsScheduled(false);
      setScheduledAt("");
      setIsRecurring(false);
      
      // Reload jobs
      loadJobs();
    } catch (error: any) {
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
    return (new Date().getTime() - lastHeartbeat.getTime()) < 5 * 60 * 1000;
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

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-gradient-card border-primary/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Agentes Disponiveis</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">{agents.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {activeAgents.length} online
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-card border-accent/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Tarefas Recentes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">{recentJobs.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              últimas 20 tarefas
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-card border-success/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Tarefas Pendentes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">
              {recentJobs.filter(j => j.status === 'queued').length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              aguardando execução
            </p>
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
                    <Label htmlFor="agent">Agente</Label>
                    <Select value={selectedAgent} onValueChange={setSelectedAgent}>
                      <SelectTrigger id="agent">
                        <SelectValue placeholder="Selecione um agente" />
                      </SelectTrigger>
                      <SelectContent>
                        {agents.length === 0 ? (
                          <SelectItem value="none" disabled>
                            Nenhum agente disponivel
                          </SelectItem>
                        ) : (
                          agents.map((agent) => {
                            const isOnline = activeAgents.some(a => a.id === agent.id);
                            return (
                              <SelectItem key={agent.id} value={agent.agent_name}>
                                <div className="flex items-center gap-2">
                                  <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-success' : 'bg-muted'}`} />
                                  {agent.agent_name}
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

                  {/* Payload */}
                  <div className="space-y-2">
                    <Label htmlFor="payload">Payload (JSON)</Label>
                    <Textarea
                      id="payload"
                      value={payload}
                      onChange={(e) => setPayload(e.target.value)}
                      placeholder='{"key": "value"}'
                      className="font-mono text-sm min-h-[200px]"
                    />
                    <p className="text-xs text-muted-foreground">
                      Dados adicionais para o job em formato JSON
                    </p>
                  </div>

                  {/* Schedule Switch */}
                  <div className="flex items-center justify-between p-4 bg-secondary/30 rounded-lg border border-border">
                    <div className="space-y-0.5">
                      <Label htmlFor="scheduled">Agendar para Depois</Label>
                      <p className="text-xs text-muted-foreground">
                        Job sera executado em uma data e hora especifica
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
                        Job sera executado automaticamente neste horario
                      </p>
                    </div>
                  )}

                  {/* Recurring Switch */}
                  <div className="flex items-center justify-between p-4 bg-secondary/30 rounded-lg border border-border">
                    <div className="space-y-0.5">
                      <Label htmlFor="recurring">Job Recorrente</Label>
                      <p className="text-xs text-muted-foreground">
                        Job sera executado automaticamente em intervalos regulares
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
                        Primeira execucao ocorrera no proximo intervalo
                      </p>
                    </div>
                  )}

                  {/* Approved Switch */}
                  <div className="flex items-center justify-between p-4 bg-secondary/30 rounded-lg border border-border">
                    <div className="space-y-0.5">
                      <Label htmlFor="approved">Aprovacao Automatica</Label>
                      <p className="text-xs text-muted-foreground">
                        Job sera executado sem aprovacao manual
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
                        Criando Job...
                      </>
                    ) : (
                      <>
                        <Plus className="mr-2 h-5 w-5" />
                        Criar Job
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
          <Card className="bg-gradient-card border-primary/20">
            <CardHeader>
              <CardTitle>Jobs Recentes</CardTitle>
              <CardDescription>Ultimos 20 jobs criados</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingData ? (
                <p className="text-center text-muted-foreground py-8">Carregando...</p>
              ) : recentJobs.length === 0 ? (
                <div className="text-center py-12">
                  <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">Nenhum job encontrado</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentJobs.map((job) => (
                    <div
                      key={job.id}
                      className="p-4 bg-secondary/30 rounded-lg border border-border hover:border-primary/30 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className="font-mono">
                              {job.agent_name}
                            </Badge>
                            <Badge variant="secondary">{job.type}</Badge>
                            {getStatusBadge(job.status)}
                            {!job.approved && (
                              <Badge variant="outline" className="bg-warning/20 text-warning border-warning/30">
                                Aguardando aprovacao
                              </Badge>
                            )}
                            {job.scheduled_at && (
                              <Badge variant="outline" className="bg-accent/20 text-accent border-accent/30">
                                <Clock className="h-3 w-3 mr-1" />
                                Agendado
                              </Badge>
                            )}
                            {job.is_recurring && (
                              <Badge variant="outline" className="bg-primary/20 text-primary border-primary/30">
                                ? Recorrente
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground font-mono">
                            ID: {job.id}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Criado: {new Date(job.created_at).toLocaleString('pt-BR')}
                          </p>
                          {job.scheduled_at && (
                            <p className="text-xs text-accent">
                              Execucao agendada: {new Date(job.scheduled_at).toLocaleString('pt-BR')}
                            </p>
                          )}
                          {job.is_recurring && job.next_run_at && (
                            <p className="text-xs text-primary">
                              Proxima execucao: {new Date(job.next_run_at).toLocaleString('pt-BR')}
                            </p>
                          )}
                          {job.is_recurring && job.last_run_at && (
                            <p className="text-xs text-muted-foreground">
                              Ultima execucao: {new Date(job.last_run_at).toLocaleString('pt-BR')}
                            </p>
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
    </div>
  );
};

export default JobCreator;
