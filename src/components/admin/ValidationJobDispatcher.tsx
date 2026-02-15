import { useState } from "react";
import { useTenant } from "@/hooks/useTenant";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Package, RefreshCw, Loader2, CheckCircle } from "lucide-react";
import { prepareJobForInsert } from "@/lib/job-utils";

export function ValidationJobDispatcher() {
  const { tenant } = useTenant();
  const [isCreatingJobs, setIsCreatingJobs] = useState(false);
  const [jobsCreated, setJobsCreated] = useState<string[]>([]);

  const createValidationJobs = async () => {
    setIsCreatingJobs(true);
    setJobsCreated([]);
    const created: string[] = [];

    try {
      if (!tenant) throw new Error("Tenant não selecionado");

      // Get TESTEMIT agent - ADR-026: Use agents_safe view
      const { data: testemitAgent, error: testemitError } = await supabase
        .from('agents_safe')
        .select('id, agent_name')
        .eq('agent_name', 'TESTEMIT')
        .eq('tenant_id', tenant.id)
        .single();

      if (testemitError || !testemitAgent) {
        toast.error("Agente TESTEMIT não encontrado");
      } else {
        // Create software_inventory_collect job for TESTEMIT
        const testemitJobData = await prepareJobForInsert({
          tenant_id: tenant.id,
          agent_id: testemitAgent.id,
          agent_name: testemitAgent.agent_name,
          type: 'software_inventory_collect',
          status: 'queued',
          payload: {},
          approved: true
        });

        const { error: testemitJobError } = await supabase
          .from('jobs')
          .insert(testemitJobData);

        if (testemitJobError) {
          toast.error(`Erro ao criar job para TESTEMIT: ${testemitJobError.message}`);
        } else {
          created.push('software_inventory_collect para TESTEMIT');
          toast.success('Job de inventário criado para TESTEMIT');
        }
      }

      // Get testepc2 agent - ADR-026: Use agents_safe view
      const { data: testepc2Agent, error: testepc2Error } = await supabase
        .from('agents_safe')
        .select('id, agent_name')
        .eq('agent_name', 'testepc2')
        .eq('tenant_id', tenant.id)
        .single();

      if (testepc2Error || !testepc2Agent) {
        toast.error("Agente testepc2 não encontrado");
      } else {
        // Create update_agent job for testepc2
        const testepc2JobData = await prepareJobForInsert({
          tenant_id: tenant.id,
          agent_id: testepc2Agent.id,
          agent_name: testepc2Agent.agent_name,
          type: 'update_agent',
          status: 'queued',
          payload: {
            target_version: 'v3.10.9-PSCUSTOMOBJECT-FIX',
            platform: 'windows'
          },
          approved: true
        });

        const { error: updateJobError } = await supabase
          .from('jobs')
          .insert(testepc2JobData);

        if (updateJobError) {
          toast.error(`Erro ao criar job para testepc2: ${updateJobError.message}`);
        } else {
          created.push('update_agent para testepc2');
          toast.success('Job de atualização criado para testepc2');
        }
      }

      setJobsCreated(created);

      if (created.length === 2) {
        toast.success("Todos os jobs de validação criados!", {
          description: "Aguarde 60 segundos e verifique os resultados"
        });
      }

    } catch (error: any) {
      console.error('Error creating validation jobs:', error);
      toast.error('Erro ao criar jobs', {
        description: error.message
      });
    } finally {
      setIsCreatingJobs(false);
    }
  };

  return (
    <Card className="border-l-4 border-l-primary">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CheckCircle className="h-5 w-5" />
          Validação do Sistema
        </CardTitle>
        <CardDescription>
          Criar jobs de validação para TESTEMIT e testepc2
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Este botão irá criar automaticamente:
          </p>
          <ul className="text-sm space-y-1 ml-4">
            <li className="flex items-center gap-2">
              <Package className="h-4 w-4 text-blue-500" />
              <span>
                <strong>software_inventory_collect</strong> para TESTEMIT
              </span>
            </li>
            <li className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-orange-500" />
              <span>
                <strong>update_agent</strong> para testepc2 (v3.10.9)
              </span>
            </li>
          </ul>
        </div>

        <Button
          onClick={createValidationJobs}
          disabled={isCreatingJobs}
          className="w-full gap-2"
        >
          {isCreatingJobs ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Criando Jobs...
            </>
          ) : (
            <>
              <CheckCircle className="h-4 w-4" />
              Criar Jobs de Validação
            </>
          )}
        </Button>

        {jobsCreated.length > 0 && (
          <div className="p-3 rounded-md bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900">
            <p className="text-sm font-medium text-green-800 dark:text-green-200 mb-1">
              Jobs Criados com Sucesso:
            </p>
            <ul className="text-xs text-green-700 dark:text-green-300 space-y-1">
              {jobsCreated.map((job, idx) => (
                <li key={idx} className="flex items-center gap-2">
                  <CheckCircle className="h-3 w-3" />
                  {job}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
