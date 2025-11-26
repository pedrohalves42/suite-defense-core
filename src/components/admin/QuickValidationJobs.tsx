import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CheckCircle2, Loader2, PlayCircle } from "lucide-react";

interface ValidationJob {
  agentName: string;
  jobType: string;
  label: string;
}

const VALIDATION_JOBS: ValidationJob[] = [
  { agentName: "testepc2", jobType: "update_agent", label: "testepc2 - Update Agent (v3.10.7 → v3.10.9)" },
  { agentName: "TESTEMIT", jobType: "software_inventory_collect", label: "TESTEMIT - Software Inventory" },
  { agentName: "testepc2", jobType: "software_inventory_collect", label: "testepc2 - Software Inventory" },
  { agentName: "TESTEMIT", jobType: "collect_antivirus_status", label: "TESTEMIT - Antivirus Status" },
  { agentName: "TESTEBMG", jobType: "collect_antivirus_status", label: "TESTEBMG - Antivirus Status" },
  { agentName: "testepc2", jobType: "collect_antivirus_status", label: "testepc2 - Antivirus Status" },
  { agentName: "testepc2", jobType: "collect_web_activity", label: "testepc2 - Web Activity" },
];

export function QuickValidationJobs() {
  const [isCreating, setIsCreating] = useState(false);
  const [completedJobs, setCompletedJobs] = useState<Set<string>>(new Set());

  const createValidationJobs = async () => {
    setIsCreating(true);
    const created = new Set<string>();

    try {
      // Get user's tenant_id
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const { data: userRole } = await supabase
        .from('user_roles')
        .select('tenant_id')
        .eq('user_id', user.id)
        .single();

      if (!userRole) throw new Error("Tenant não encontrado");

      // Get agent IDs
      const { data: agents } = await supabase
        .from('agents')
        .select('id, agent_name, agent_version')
        .eq('tenant_id', userRole.tenant_id)
        .in('agent_name', ['TESTEMIT', 'TESTEBMG', 'testepc2']);

      if (!agents || agents.length === 0) {
        throw new Error("Agentes não encontrados");
      }

      // Create all jobs
      const jobsToCreate = VALIDATION_JOBS.map(vJob => {
        const agent = agents.find(a => a.agent_name === vJob.agentName);
        if (!agent) return null;

        // Special payload for update_agent job
        const payload = vJob.jobType === 'update_agent' 
          ? { 
              current_version: agent.agent_version || 'v3.10.7',
              target_version: 'v3.10.9-PSCUSTOMOBJECT-FIX' 
            }
          : {};

        return {
          tenant_id: userRole.tenant_id,
          agent_id: agent.id,
          agent_name: agent.agent_name,
          type: vJob.jobType,
          status: 'queued',
          payload,
          approved: true
        };
      }).filter(Boolean);

      const { error } = await supabase
        .from('jobs')
        .insert(jobsToCreate);

      if (error) throw error;

      // Mark all as completed
      VALIDATION_JOBS.forEach(job => {
        created.add(`${job.agentName}-${job.jobType}`);
      });

      setCompletedJobs(created);

      toast.success("Jobs de validação criados com sucesso", {
        description: `${jobsToCreate.length} jobs foram criados e serão processados pelos agentes`
      });
    } catch (error: any) {
      console.error('Error creating validation jobs:', error);
      toast.error('Erro ao criar jobs de validação', {
        description: error.message
      });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PlayCircle className="h-5 w-5" />
          Jobs de Validação Rápida
        </CardTitle>
        <CardDescription>
          Criar jobs para coletar dados faltantes nos agentes de teste
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          {VALIDATION_JOBS.map((job) => {
            const jobKey = `${job.agentName}-${job.jobType}`;
            const isCompleted = completedJobs.has(jobKey);

            return (
              <div 
                key={jobKey}
                className="flex items-center justify-between p-3 border rounded-lg bg-card"
              >
                <span className="text-sm font-medium">{job.label}</span>
                {isCompleted && (
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                )}
              </div>
            );
          })}
        </div>

        <Button
          onClick={createValidationJobs}
          disabled={isCreating || completedJobs.size === VALIDATION_JOBS.length}
          className="w-full"
        >
          {isCreating && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          {completedJobs.size === VALIDATION_JOBS.length 
            ? "Jobs Criados" 
            : "Criar Todos os Jobs de Validação"}
        </Button>

        {completedJobs.size > 0 && (
          <p className="text-xs text-muted-foreground text-center">
            {completedJobs.size} de {VALIDATION_JOBS.length} jobs criados
          </p>
        )}
      </CardContent>
    </Card>
  );
}
