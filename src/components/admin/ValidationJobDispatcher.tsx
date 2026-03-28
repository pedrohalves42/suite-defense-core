import { useState } from "react";
import { useTenant } from "@/hooks/useTenant";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Package, Shield, AlertTriangle, Activity, Loader2, CheckCircle, Rocket } from "lucide-react";
import { prepareJobForInsert } from "@/lib/job-utils";
import { logger } from '@/lib/logger';

const ALL_JOB_TYPES = [
  {
    type: 'software_inventory_collect',
    name: 'Inventário de Software',
    icon: Package,
    payload: {},
  },
  {
    type: 'light_vuln_scan',
    name: 'Scan de Vulnerabilidades',
    icon: AlertTriangle,
    payload: {},
  },
  {
    type: 'collect_web_activity',
    name: 'Atividade Web',
    icon: Activity,
    payload: { max_domains: 500, browsers: ['chrome', 'firefox', 'edge', 'opera', 'opera_gx', 'brave', 'vivaldi'], days_back: 7 },
  },
  {
    type: 'collect_antivirus_status',
    name: 'Status do Antivírus',
    icon: Shield,
    payload: {},
  },
];

export function ValidationJobDispatcher() {
  const { tenant } = useTenant();
  const [isCreatingJobs, setIsCreatingJobs] = useState(false);
  const [jobsCreated, setJobsCreated] = useState<string[]>([]);
  const [jobsFailed, setJobsFailed] = useState<string[]>([]);

  const createAllJobsForAllAgents = async () => {
    setIsCreatingJobs(true);
    setJobsCreated([]);
    setJobsFailed([]);
    const created: string[] = [];
    const failed: string[] = [];

    try {
      if (!tenant) throw new Error("Tenant não selecionado");

      // Get all active agents on v5.0.14
      const { data: agentsRaw } = await supabase.rpc('get_agents_list', {
        p_tenant_id: tenant.id,
        p_include_archived: false,
      });
      const allAgents = (agentsRaw as any as Array<{ id: string; agent_name: string; status: string; agent_version: string | null }>) || [];
      
      const targetAgents = allAgents.filter(a => 
        a.status === 'active' && a.agent_version && a.agent_version.includes('5.0.14')
      );

      if (targetAgents.length === 0) {
        toast.error("Nenhum agente ativo na versão v5.0.14 encontrado");
        setIsCreatingJobs(false);
        return;
      }

      toast.info(`Criando ${ALL_JOB_TYPES.length} jobs para ${targetAgents.length} agentes v5.0.14...`);

      for (const agent of targetAgents) {
        for (const jobDef of ALL_JOB_TYPES) {
          try {
            const jobData = await prepareJobForInsert({
              tenant_id: tenant.id,
              agent_id: agent.id,
              agent_name: agent.agent_name,
              type: jobDef.type,
              status: 'queued',
              payload: jobDef.payload,
              approved: true,
            });

            const { error } = await supabase.from('jobs').insert(jobData);

            if (error) {
              // Dedup index may block — not a real failure
              if (error.message.includes('duplicate') || error.message.includes('idx_jobs_dedup')) {
                failed.push(`${jobDef.type} → ${agent.agent_name} (já existe)`);
              } else {
                throw error;
              }
            } else {
              created.push(`${jobDef.name} → ${agent.agent_name}`);
            }
          } catch (err) {
            failed.push(`${jobDef.type} → ${agent.agent_name}: ${err.message}`);
          }
        }
      }

      setJobsCreated(created);
      setJobsFailed(failed);

      if (created.length > 0) {
        toast.success(`${created.length} jobs criados com sucesso!`, {
          description: `Para ${targetAgents.length} agentes. Aguarde o processamento.`,
        });
      }
      if (failed.length > 0) {
        toast.warning(`${failed.length} jobs não foram criados`, {
          description: "Podem já existir jobs ativos para esses agentes",
        });
      }
    } catch (error) {
      logger.error('Error creating validation jobs:', error);
      toast.error('Erro ao criar jobs', { description: error.message });
    } finally {
      setIsCreatingJobs(false);
    }
  };

  return (
    <Card className="border-l-4 border-l-primary">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Rocket className="h-5 w-5" />
          Validação Completa — Todos os Agentes v5.0.14
        </CardTitle>
        <CardDescription>
          Cria todos os jobs de segurança para cada agente ativo na versão v5.0.14
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Jobs que serão criados para <strong>cada agente</strong>:
          </p>
          <ul className="text-sm space-y-1 ml-4">
            {ALL_JOB_TYPES.map((job) => {
              const Icon = job.icon;
              return (
                <li key={job.type} className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-primary" />
                  <span><strong>{job.type}</strong> — {job.name}</span>
                </li>
              );
            })}
          </ul>
        </div>

        <Button
          onClick={createAllJobsForAllAgents}
          disabled={isCreatingJobs}
          className="w-full gap-2"
          size="lg"
        >
          {isCreatingJobs ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Criando Jobs para Todos os Agentes...
            </>
          ) : (
            <>
              <Rocket className="h-4 w-4" />
              Disparar Todos os Jobs (v5.0.14)
            </>
          )}
        </Button>

        {jobsCreated.length > 0 && (
          <div className="p-3 rounded-md bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 max-h-48 overflow-y-auto">
            <p className="text-sm font-medium text-green-800 dark:text-green-200 mb-1">
              ✅ {jobsCreated.length} Jobs Criados:
            </p>
            <ul className="text-xs text-green-700 dark:text-green-300 space-y-0.5">
              {jobsCreated.map((job, idx) => (
                <li key={idx} className="flex items-center gap-1">
                  <CheckCircle className="h-3 w-3 shrink-0" />
                  {job}
                </li>
              ))}
            </ul>
          </div>
        )}

        {jobsFailed.length > 0 && (
          <div className="p-3 rounded-md bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-900 max-h-32 overflow-y-auto">
            <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200 mb-1">
              ⚠️ {jobsFailed.length} Jobs Ignorados:
            </p>
            <ul className="text-xs text-yellow-700 dark:text-yellow-300 space-y-0.5">
              {jobsFailed.map((job, idx) => (
                <li key={idx}>{job}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
