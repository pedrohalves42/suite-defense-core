import { useState } from "react";
import { useTenant } from "@/hooks/useTenant";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Shield, Package, AlertTriangle, Activity, Loader2 } from "lucide-react";
import { prepareJobForInsert } from "@/lib/job-utils";
import {
import { logger } from '@/lib/logger';
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Agent {
  id: string;
  agent_name: string;
  status: string;
}

export function SecurityJobDispatcher({ agents }: { agents: Agent[] }) {
  const { tenant } = useTenant();
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const [isCreatingJob, setIsCreatingJob] = useState(false);

  const createSecurityJob = async (jobType: string, jobName: string) => {
    if (!selectedAgentId) {
      toast.error("Selecione um agente primeiro");
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

      const defaultPayloadByType: Partial<Record<string, {
        max_domains: number;
        browsers: string[];
        days_back: number;
      }>> = {
        collect_web_activity: { max_domains: 500, browsers: ['chrome', 'firefox', 'edge', 'opera', 'opera_gx', 'brave', 'vivaldi'], days_back: 7 },
      };

      // Create job
      const jobData = await prepareJobForInsert({
        tenant_id: tenant.id,
        agent_id: selectedAgentId,
        agent_name: agent.agent_name,
        type: jobType,
        status: 'queued',
        payload: defaultPayloadByType[jobType] ?? {},
        approved: true
      });

      const { error } = await supabase
        .from('jobs')
        .insert(jobData);

      if (error) throw error;

      toast.success(`Job "${jobName}" criado com sucesso`, {
        description: `O agente ${agent.agent_name} processará o job em breve`
      });
    } catch (error: any) {
      logger.error('Error creating security job:', error);
      toast.error('Erro ao criar job', {
        description: error.message
      });
    } finally {
      setIsCreatingJob(false);
    }
  };

  const securityJobs = [
    {
      type: 'software_inventory_collect',
      name: 'Inventário de Software',
      description: 'Coleta lista de programas instalados',
      icon: Package,
      color: 'text-blue-500'
    },
    {
      type: 'light_vuln_scan',
      name: 'Scan de Vulnerabilidades',
      description: 'Verifica patches e vulnerabilidades conhecidas',
      icon: AlertTriangle,
      color: 'text-orange-500'
    },
    {
      type: 'collect_web_activity',
      name: 'Atividade Web',
      description: 'Coleta histórico de DNS cache',
      icon: Activity,
      color: 'text-green-500'
    },
    {
      type: 'collect_antivirus_status',
      name: 'Status do Antivírus',
      description: 'Verifica status e última atualização do antivírus',
      icon: Shield,
      color: 'text-purple-500'
    }
  ];

  const onlineAgents = agents.filter(a => a.status === 'active');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Disparar Jobs de Segurança
        </CardTitle>
        <CardDescription>
          Crie jobs de segurança para coletar dados dos agentes
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="text-sm font-medium mb-2 block">
            Selecione o Agente
          </label>
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
          {securityJobs.map((job) => {
            const Icon = job.icon;
            return (
              <Button
                key={job.type}
                variant="outline"
                className="h-auto flex-col items-start gap-2 p-4"
                disabled={!selectedAgentId || isCreatingJob}
                onClick={() => createSecurityJob(job.type, job.name)}
              >
                <div className="flex items-center gap-2 w-full">
                  <Icon className={`h-5 w-5 ${job.color}`} />
                  <span className="font-semibold">{job.name}</span>
                  {isCreatingJob && (
                    <Loader2 className="h-4 w-4 animate-spin ml-auto" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground text-left">
                  {job.description}
                </p>
              </Button>
            );
          })}
        </div>

        {onlineAgents.length === 0 && (
          <div className="text-sm text-muted-foreground text-center py-4 border rounded-md bg-muted/50">
            Nenhum agente online. Jobs de segurança só podem ser criados para agentes ativos.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
