import { useState, useEffect } from "react";
import { Zap, Plus, Server, CheckCircle, XCircle, Clock, AlertCircle } from "lucide-react";
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

  // Form state
  const [selectedAgent, setSelectedAgent] = useState<string>("");
  const [jobType, setJobType] = useState<string>("scan");
  const [payload, setPayload] = useState<string>("{}");
  const [approved, setApproved] = useState<boolean>(true);
  const [isScheduled, setIsScheduled] = useState<boolean>(false);
  const [scheduledAt, setScheduledAt] = useState<string>("");
  const [isRecurring, setIsRecurring] = useState<boolean>(false);
  const [recurrencePattern, setRecurrencePattern] = useState<string>("0 * * * *");

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
  }, []);

  const loadData = async () => {
    setLoadingData(true);
    await Promise.all([loadAgents(), loadJobs()]);
    setLoadingData(false);
  };

  const loadAgents = async () => {
    try {
      const { data, error } = await supabase
        .from("agents")
        .select("*")
        .order("agent_name", { ascending: true });

      if (error) throw error;
      setAgents(data || []);
    } catch (error) {
      logger.error("Erro ao carregar agentes", error);
      toast.error("Erro ao carregar lista de agentes");
    }
  };

  const loadJobs = async () => {
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
  };

  const getJobTypeExamples = (type: string) => {
    const examples: Record<string, any> = {
      scan: {
        path: "/path/to/scan",
        recursive: true,
        extensions: [".exe", ".dll", ".bat"]
      },
      update: {
        version: "2.0.0",
        url: "https://example.com/update.zip"
      },
      report: {
        type: "system_info",
        include_logs: true
      },
      config: {
        polling_interval: 60,
        enable_auto_update: true
      }
    };
    return JSON.stringify(examples[type] || {}, null, 2);
  };

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
      toast.error("Selecione um padrão de recorrência");
      return;
    }

    let parsedPayload;
    try {
      parsedPayload = JSON.parse(payload);
    } catch (error) {
      toast.error("Payload JSON inválido");
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

      if (error) throw error;

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
      logger.error("Erro ao criar job", error);
      toast.error(error.message || "Erro ao criar job");
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { color: string; icon: any }> = {
      queued: { color: "bg-warning/20 text-warning border-warning/30", icon: Clock },
      delivered: { color: "bg-primary/20 text-primary border-primary/30", icon: Server },
      done: { color: "bg-success/20 text-success border-success/30", icon: CheckCircle },
      failed: { color: "bg-destructive/20 text-destructive border-destructive/30", icon: XCircle }
    };

    const variant = variants[status] || variants.queued;
    const Icon = variant.icon;

    return (
      <Badge variant="outline" className={`${variant.color} gap-1`}>
        <Icon className="h-3 w-3" />
        {status}
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
      <div className="flex items-center gap-3">
        <div className="p-3 bg-gradient-cyber rounded-xl border border-primary/20 shadow-glow-primary">
          <Zap className="h-8 w-8 text-primary animate-pulse-glow" />
        </div>
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            Criador de Jobs
          </h1>
          <p className="text-sm text-muted-foreground">Crie e gerencie jobs para os agentes</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-gradient-card border-primary/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Agentes Disponíveis</CardTitle>
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
            <CardTitle className="text-sm font-medium">Jobs Recentes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">{recentJobs.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              últimos 20 jobs
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-card border-success/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Jobs Pendentes</CardTitle>
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
          <TabsTrigger value="create">Criar Job</TabsTrigger>
          <TabsTrigger value="history">Histórico</TabsTrigger>
        </TabsList>

        {/* Create Job Tab */}
        <TabsContent value="create" className="mt-4">
          <Card className="bg-gradient-card border-primary/20">
            <CardHeader>
              <CardTitle>Novo Job</CardTitle>
              <CardDescription>
                Configure e inicie um novo job para um agente
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
                            Nenhum agente disponível
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
                    <Label htmlFor="type">Tipo de Job</Label>
                    <Select value={jobType} onValueChange={handleJobTypeChange}>
                      <SelectTrigger id="type">
                        <SelectValue placeholder="Selecione o tipo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="scan">Scan (Verificação de segurança)</SelectItem>
                        <SelectItem value="update">Update (Atualização do agente)</SelectItem>
                        <SelectItem value="report">Report (Gerar relatório)</SelectItem>
                        <SelectItem value="config">Config (Alterar configuração)</SelectItem>
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
                        Job será executado em uma data e hora específica
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
                        Job será executado automaticamente neste horário
                      </p>
                    </div>
                  )}

                  {/* Recurring Switch */}
                  <div className="flex items-center justify-between p-4 bg-secondary/30 rounded-lg border border-border">
                    <div className="space-y-0.5">
                      <Label htmlFor="recurring">Job Recorrente</Label>
                      <p className="text-xs text-muted-foreground">
                        Job será executado automaticamente em intervalos regulares
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
                      <Label htmlFor="recurrence">Padrão de Recorrência</Label>
                      <Select value={recurrencePattern} onValueChange={setRecurrencePattern}>
                        <SelectTrigger id="recurrence">
                          <SelectValue placeholder="Selecione a frequência" />
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
                      <Label htmlFor="approved">Aprovação Automática</Label>
                      <p className="text-xs text-muted-foreground">
                        Job será executado sem aprovação manual
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
              <CardDescription>Últimos 20 jobs criados</CardDescription>
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
                                Aguardando aprovação
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
                                🔁 Recorrente
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
                              Execução agendada: {new Date(job.scheduled_at).toLocaleString('pt-BR')}
                            </p>
                          )}
                          {job.is_recurring && job.next_run_at && (
                            <p className="text-xs text-primary">
                              Próxima execução: {new Date(job.next_run_at).toLocaleString('pt-BR')}
                            </p>
                          )}
                          {job.is_recurring && job.last_run_at && (
                            <p className="text-xs text-muted-foreground">
                              Última execução: {new Date(job.last_run_at).toLocaleString('pt-BR')}
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
