import { useState, useCallback, useEffect } from "react";
import { Plus, Clock } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { JOB_TYPE_LABELS } from "@/lib/job-labels";
import { getAgentDisplayName } from "@/lib/agent-utils";
import type { Agent } from "./types";

interface JobFormProps {
  agents: Agent[];
  activeAgents: Agent[];
  latestVersion: string;
  loadingData: boolean;
  onJobCreated: () => void;
}

export function JobForm({ agents, activeAgents, latestVersion, loadingData, onJobCreated }: JobFormProps) {
  const [loading, setLoading] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<string>("");
  const [jobType, setJobType] = useState<string>("scan");
  const [payload, setPayload] = useState<string>("{}");
  const [approved, setApproved] = useState<boolean>(true);
  const [isScheduled, setIsScheduled] = useState<boolean>(false);
  const [scheduledAt, setScheduledAt] = useState<string>("");
  const [isRecurring, setIsRecurring] = useState<boolean>(false);
  const [recurrencePattern, setRecurrencePattern] = useState<string>("0 * * * *");

  const getJobTypeExamples = useCallback((type: string) => {
    const examples: Record<string, Record<string, unknown>> = {
      scan: { filePath: "C:\\Windows\\System32", recursive: true, extensions: [".exe", ".dll", ".bat"] },
      update: { target_version: latestVersion, force: false },
      report: { type: "security_report", include_software: true, include_vulnerabilities: true, include_antivirus: true },
      config: { polling_interval: 60, enable_auto_update: true },
      software_inventory_collect: {},
      collect_antivirus_status: {},
      collect_web_activity: {},
      light_vuln_scan: {}
    };
    return JSON.stringify(examples[type] || {}, null, 2);
  }, [latestVersion]);

  useEffect(() => {
    if (jobType === "update") setPayload(getJobTypeExamples("update"));
  }, [latestVersion, jobType, getJobTypeExamples]);

  const handleJobTypeChange = (newType: string) => {
    setJobType(newType);
    setPayload(getJobTypeExamples(newType));
  };

  const createJob = async () => {
    if (!selectedAgent) { toast.error("Selecione um agente"); return; }
    if (!jobType) { toast.error("Selecione um tipo de job"); return; }
    if (isScheduled && !scheduledAt) { toast.error("Defina a data e hora do agendamento"); return; }
    if (isRecurring && !recurrencePattern) { toast.error("Selecione um padrao de recorrencia"); return; }

    let parsedPayload;
    try { parsedPayload = JSON.parse(payload); } catch { toast.error("Payload JSON invalido"); return; }

    if (jobType === "scan" && (!parsedPayload.filePath || parsedPayload.filePath.trim() === "")) {
      toast.error("O campo 'filePath' é obrigatório para jobs de scan.");
      return;
    }

    setLoading(true);
    try {
      const requestBody: Record<string, unknown> = { agentName: selectedAgent, type: jobType, payload: parsedPayload, approved };
      if (isScheduled && scheduledAt) requestBody.scheduledAt = new Date(scheduledAt).toISOString();
      if (isRecurring) { requestBody.isRecurring = true; requestBody.recurrencePattern = recurrencePattern; }

      const { error } = await supabase.functions.invoke('create-job', { body: requestBody });

      if (error) {
        const errorData = typeof error === 'object' && 'error' in error ? (error as Record<string, unknown>).error : error;
        const errorCode = (errorData as Record<string, unknown>)?.code;
        const errorMessage = (errorData as Record<string, unknown>)?.message || error.message || "Erro ao criar job";

        if (errorCode === 'FORBIDDEN') toast.error("Acesso negado. E necessario ter papel admin, operator ou super_admin.");
        else if (errorCode === 'AGENT_NOT_FOUND') toast.error("Agente nao encontrado ou nao pertence ao tenant.");
        else if (errorCode === 'TENANT_NOT_FOUND') toast.error("Tenant nao encontrado.");
        else toast.error(String(errorMessage));
        logger.error("Erro ao criar job", { error, errorCode, errorMessage });
        return;
      }

      const jobTypeLabel = isRecurring ? 'Tarefa recorrente' : isScheduled ? 'Tarefa agendada' : 'Tarefa';
      toast.success(`${jobTypeLabel} criada com sucesso!`);
      setPayload(getJobTypeExamples(jobType));
      setIsScheduled(false);
      setScheduledAt("");
      setIsRecurring(false);
      onJobCreated();
    } catch (error) {
      logger.error("Erro inesperado ao criar job", error);
      toast.error("Erro inesperado ao criar job. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  if (loadingData) {
    return <p className="text-center text-muted-foreground py-8">Carregando...</p>;
  }

  return (
    <Card className="bg-gradient-card border-primary/20">
      <CardHeader>
        <CardTitle>Nova Tarefa</CardTitle>
        <CardDescription>Configure e inicie uma nova tarefa para um computador</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Agent Selection */}
        <div className="space-y-2">
          <Label htmlFor="agent">Computador</Label>
          <Select value={selectedAgent} onValueChange={setSelectedAgent}>
            <SelectTrigger id="agent"><SelectValue placeholder="Selecione um computador" /></SelectTrigger>
            <SelectContent>
              {agents.length === 0 ? (
                <SelectItem value="none" disabled>Nenhum computador disponível</SelectItem>
              ) : agents.map((agent) => {
                const isOnline = activeAgents.some(a => a.id === agent.id);
                return (
                  <SelectItem key={agent.id} value={agent.agent_name}>
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-success' : 'bg-muted'}`} />
                      {getAgentDisplayName(agent)}
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        {/* Job Type */}
        <div className="space-y-2">
          <Label htmlFor="type">Tipo de Tarefa</Label>
          <Select value={jobType} onValueChange={handleJobTypeChange}>
            <SelectTrigger id="type"><SelectValue placeholder="Selecione o tipo" /></SelectTrigger>
            <SelectContent>
              {Object.entries(JOB_TYPE_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Payload */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="payload">Configurações da Tarefa</Label>
            <Badge variant="outline" className="text-xs">Preenchimento automático</Badge>
          </div>
          <div className="p-3 bg-muted/50 rounded-lg border text-sm">
            <p className="text-muted-foreground">As configurações são preenchidas automaticamente com base no tipo selecionado.</p>
          </div>
          <details className="group">
            <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
              ⚙️ Configurações detalhadas (opcional)
            </summary>
            <Textarea id="payload" value={payload} onChange={(e) => setPayload(e.target.value)}
              placeholder='{"key": "value"}' className="font-mono text-sm min-h-[150px] mt-2" />
          </details>
        </div>

        {/* Schedule Switch */}
        <div className="flex items-center justify-between p-4 bg-secondary/30 rounded-lg border border-border">
          <div className="space-y-0.5">
            <Label htmlFor="scheduled">⏰ Agendar para Depois</Label>
            <p className="text-xs text-muted-foreground">Tarefa será executada em data e hora específica</p>
          </div>
          <Switch id="scheduled" checked={isScheduled}
            onCheckedChange={(checked) => { setIsScheduled(checked); if (!checked) setScheduledAt(""); if (checked) setIsRecurring(false); }} />
        </div>

        {isScheduled && (
          <div className="space-y-2">
            <Label htmlFor="scheduledAt">Data e Hora</Label>
            <Input id="scheduledAt" type="datetime-local" value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)} min={new Date().toISOString().slice(0, 16)} className="font-mono" />
            <p className="text-xs text-muted-foreground">Tarefa será executada automaticamente neste horário</p>
          </div>
        )}

        {/* Recurring Switch */}
        <div className="flex items-center justify-between p-4 bg-secondary/30 rounded-lg border border-border">
          <div className="space-y-0.5">
            <Label htmlFor="recurring">🔄 Tarefa Recorrente</Label>
            <p className="text-xs text-muted-foreground">Tarefa será executada em intervalos regulares</p>
          </div>
          <Switch id="recurring" checked={isRecurring}
            onCheckedChange={(checked) => { setIsRecurring(checked); if (checked) setIsScheduled(false); }} />
        </div>

        {isRecurring && (
          <div className="space-y-2">
            <Label htmlFor="recurrence">Padrão de Recorrência</Label>
            <Select value={recurrencePattern} onValueChange={setRecurrencePattern}>
              <SelectTrigger id="recurrence"><SelectValue placeholder="Selecione a frequencia" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="*/5 * * * *">A cada 5 minutos</SelectItem>
                <SelectItem value="*/15 * * * *">A cada 15 minutos</SelectItem>
                <SelectItem value="*/30 * * * *">A cada 30 minutos</SelectItem>
                <SelectItem value="0 * * * *">A cada hora (no minuto :00)</SelectItem>
                <SelectItem value="0 0 * * *">Diariamente (meia-noite)</SelectItem>
                <SelectItem value="0 0 * * 0">Semanalmente (domingo meia-noite)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Primeira execução ocorrerá no próximo intervalo</p>
          </div>
        )}

        {/* Approved Switch */}
        <div className="flex items-center justify-between p-4 bg-secondary/30 rounded-lg border border-border">
          <div className="space-y-0.5">
            <Label htmlFor="approved">✅ Execução Imediata</Label>
            <p className="text-xs text-muted-foreground">Tarefa será executada assim que o computador buscar</p>
          </div>
          <Switch id="approved" checked={approved} onCheckedChange={setApproved} />
        </div>

        {/* Submit */}
        <Button onClick={createJob} disabled={loading || !selectedAgent} className="w-full h-12" size="lg">
          {loading ? (
            <><Clock className="mr-2 h-5 w-5 animate-spin" />Criando Tarefa...</>
          ) : (
            <><Plus className="mr-2 h-5 w-5" />Criar Tarefa</>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
