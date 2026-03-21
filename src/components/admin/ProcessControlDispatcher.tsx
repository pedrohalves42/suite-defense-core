import { useState } from "react";
import { useTenant } from "@/hooks/useTenant";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { prepareJobForInsert } from "@/lib/job-utils";
import { 
  Skull, 
  Square, 
  Ban, 
  RotateCcw, 
  Loader2, 
  AlertTriangle,
  Shield
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { isProcessProtected, isServiceProtected, PROTECTED_PROCESSES, PROTECTED_SERVICES } from "@/lib/job-labels";
import { logger } from '@/lib/logger';

interface Agent {
  id: string;
  agent_name: string;
  status: string;
}

interface ProcessControlJob {
  type: 'kill_process' | 'stop_service' | 'disable_service' | 'restart_service';
  name: string;
  description: string;
  icon: typeof Skull;
  color: string;
  requiresTarget: 'process' | 'service';
  riskLevel: 'high' | 'critical';
}

const processControlJobs: ProcessControlJob[] = [
  {
    type: 'kill_process',
    name: 'Encerrar Processo',
    description: 'Mata um processo pelo nome ou PID',
    icon: Skull,
    color: 'text-red-500',
    requiresTarget: 'process',
    riskLevel: 'high',
  },
  {
    type: 'stop_service',
    name: 'Parar Serviço',
    description: 'Para um serviço Windows temporariamente',
    icon: Square,
    color: 'text-orange-500',
    requiresTarget: 'service',
    riskLevel: 'high',
  },
  {
    type: 'disable_service',
    name: 'Desabilitar Serviço',
    description: 'Desabilita serviço permanentemente',
    icon: Ban,
    color: 'text-red-600',
    requiresTarget: 'service',
    riskLevel: 'critical',
  },
  {
    type: 'restart_service',
    name: 'Reiniciar Serviço',
    description: 'Reinicia um serviço Windows',
    icon: RotateCcw,
    color: 'text-blue-500',
    requiresTarget: 'service',
    riskLevel: 'high',
  },
];

export function ProcessControlDispatcher({ agents }: { agents: Agent[] }) {
  const { tenant } = useTenant();
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const [selectedJob, setSelectedJob] = useState<ProcessControlJob | null>(null);
  const [targetName, setTargetName] = useState<string>("");
  const [isCreatingJob, setIsCreatingJob] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const validateTarget = (job: ProcessControlJob, target: string): { valid: boolean; error?: string } => {
    if (!target.trim()) {
      return { valid: false, error: 'Nome do alvo é obrigatório' };
    }

    if (job.requiresTarget === 'process') {
      if (isProcessProtected(target)) {
        return { 
          valid: false, 
          error: `Processo "${target}" é crítico do sistema e não pode ser encerrado` 
        };
      }
    }

    if (job.requiresTarget === 'service' && job.type !== 'restart_service') {
      if (isServiceProtected(target)) {
        return { 
          valid: false, 
          error: `Serviço "${target}" é crítico do sistema e não pode ser ${job.type === 'disable_service' ? 'desabilitado' : 'parado'}` 
        };
      }
    }

    return { valid: true };
  };

  const handleJobClick = (job: ProcessControlJob) => {
    setSelectedJob(job);
    setTargetName("");
  };

  const handleSubmit = () => {
    if (!selectedJob || !targetName) return;

    const validation = validateTarget(selectedJob, targetName);
    if (!validation.valid) {
      toast.error('Operação bloqueada', { description: validation.error });
      return;
    }

    setShowConfirmDialog(true);
  };

  const createProcessControlJob = async () => {
    if (!selectedAgentId || !selectedJob) {
      toast.error("Selecione um agente e tipo de job");
      return;
    }

    const agent = agents.find(a => a.id === selectedAgentId);
    if (!agent) {
      toast.error("Agente não encontrado");
      return;
    }

    try {
      setIsCreatingJob(true);

      if (!tenant) throw new Error("Tenant não selecionado");

      const payload = selectedJob.requiresTarget === 'process' 
        ? { process_name: targetName.trim() }
        : { service_name: targetName.trim() };

      const jobData = await prepareJobForInsert({
        tenant_id: tenant.id,
        agent_id: selectedAgentId,
        agent_name: agent.agent_name,
        type: selectedJob.type,
        status: 'queued',
        payload,
        approved: true,
      });

      const { error } = await supabase
        .from('jobs')
        .insert(jobData);

      if (error) throw error;

      // Log audit trail
      await supabase.from('audit_logs').insert({
        tenant_id: tenant.id,
        user_id: null,
        action: 'process_control_job_created',
        resource_type: 'job',
        resource_id: selectedAgentId,
        details: {
          job_type: selectedJob.type,
          agent_id: selectedAgentId,
          agent_name: agent.agent_name,
          target: targetName.trim(),
          risk_level: selectedJob.riskLevel,
        },
        success: true,
      });

      toast.success(`Job "${selectedJob.name}" criado com sucesso`, {
        description: `Alvo: ${targetName} no agente ${agent.agent_name}`
      });

      setSelectedJob(null);
      setTargetName("");
      setShowConfirmDialog(false);
    } catch (error: any) {
      logger.error('Error creating process control job:', error);
      toast.error('Erro ao criar job', { description: error.message });
    } finally {
      setIsCreatingJob(false);
    }
  };

  const onlineAgents = agents.filter(a => a.status === 'active');

  return (
    <>
      <Card className="border-destructive/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-destructive" />
            Controle de Processos
            <Badge variant="destructive" className="ml-2">Fase 1</Badge>
          </CardTitle>
          <CardDescription>
            Controle remoto de processos e serviços Windows. Ações destrutivas requerem confirmação.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-sm font-medium mb-2 block">
              Selecione o Agente
            </Label>
            <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
              <SelectTrigger>
                <SelectValue placeholder="Escolha um agente..." />
              </SelectTrigger>
              <SelectContent>
                {onlineAgents.length === 0 && (
                  <div className="p-2 text-sm text-muted-foreground">
                    Nenhum agente online disponível
                  </div>
                )}
                {onlineAgents.map((agent) => (
                  <SelectItem key={agent.id} value={agent.id}>
                    {agent.agent_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
            {processControlJobs.map((job) => {
              const Icon = job.icon;
              const isSelected = selectedJob?.type === job.type;
              return (
                <Button
                  key={job.type}
                  variant={isSelected ? "default" : "outline"}
                  className={`h-auto flex-col items-start gap-2 p-4 ${isSelected ? '' : 'hover:border-destructive/50'}`}
                  disabled={!selectedAgentId}
                  onClick={() => handleJobClick(job)}
                >
                  <div className="flex items-center gap-2 w-full">
                    <Icon className={`h-5 w-5 ${job.color}`} />
                    <span className="font-semibold">{job.name}</span>
                    <Badge 
                      variant={job.riskLevel === 'critical' ? 'destructive' : 'secondary'}
                      className="ml-auto text-xs"
                    >
                      {job.riskLevel === 'critical' ? 'Crítico' : 'Alto'}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground text-left">
                    {job.description}
                  </p>
                </Button>
              );
            })}
          </div>

          {selectedJob && (
            <div className="space-y-4 pt-4 border-t">
              <div>
                <Label htmlFor="target-name">
                  {selectedJob.requiresTarget === 'process' ? 'Nome do Processo' : 'Nome do Serviço'}
                </Label>
                <Input
                  id="target-name"
                  placeholder={selectedJob.requiresTarget === 'process' ? 'ex: notepad.exe' : 'ex: Spooler'}
                  value={targetName}
                  onChange={(e) => setTargetName(e.target.value)}
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {selectedJob.requiresTarget === 'process' 
                    ? 'Processos críticos do sistema (csrss.exe, lsass.exe, etc) são protegidos'
                    : 'Serviços essenciais do Windows são protegidos automaticamente'}
                </p>
              </div>

              <Button
                onClick={handleSubmit}
                disabled={!targetName.trim() || isCreatingJob}
                variant="destructive"
                className="w-full"
              >
                {isCreatingJob ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Criando job...
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-4 w-4 mr-2" />
                    Executar {selectedJob.name}
                  </>
                )}
              </Button>
            </div>
          )}

          {onlineAgents.length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-4 border rounded-md bg-muted/50">
              Nenhum agente online. Jobs de controle só podem ser criados para agentes ativos.
            </div>
          )}

          {/* Protected lists info */}
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer hover:text-foreground">
              Ver lista de processos e serviços protegidos
            </summary>
            <div className="mt-2 p-3 bg-muted rounded-md space-y-2">
              <div>
                <strong>Processos protegidos:</strong>
                <p className="mt-1">{PROTECTED_PROCESSES.join(', ')}</p>
              </div>
              <div>
                <strong>Serviços protegidos:</strong>
                <p className="mt-1">{PROTECTED_SERVICES.join(', ')}</p>
              </div>
            </div>
          </details>
        </CardContent>
      </Card>

      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Confirmar Ação Destrutiva
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>Você está prestes a executar:</p>
              <div className="bg-muted p-3 rounded-md">
                <p><strong>Ação:</strong> {selectedJob?.name}</p>
                <p><strong>Alvo:</strong> {targetName}</p>
                <p><strong>Agente:</strong> {agents.find(a => a.id === selectedAgentId)?.agent_name}</p>
                <p><strong>Risco:</strong> <Badge variant={selectedJob?.riskLevel === 'critical' ? 'destructive' : 'secondary'}>{selectedJob?.riskLevel === 'critical' ? 'Crítico' : 'Alto'}</Badge></p>
              </div>
              <p className="text-destructive font-medium">
                Esta ação será registrada no audit log e pode afetar o funcionamento do sistema remoto.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={createProcessControlJob}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isCreatingJob ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Confirmar Execução'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
