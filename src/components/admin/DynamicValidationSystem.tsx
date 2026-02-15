import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CheckCircle2, Loader2, PlayCircle, AlertCircle, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { prepareJobsForInsert } from "@/lib/job-utils";
import { useTenant } from "@/hooks/useTenant";

interface AgentStatus {
  id: string;
  agent_name: string;
  agent_version: string | null;
  last_heartbeat: string | null;
  hasSoftwareInventory: boolean;
  hasAntivirusStatus: boolean;
  hasWebActivity: boolean;
  hasVulnerabilities: boolean;
}

interface ValidationJob {
  agentId: string;
  agentName: string;
  jobType: string;
  label: string;
  reason: string;
}

export function DynamicValidationSystem() {
  const { tenant } = useTenant();
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [agents, setAgents] = useState<AgentStatus[]>([]);
  const [validationJobs, setValidationJobs] = useState<ValidationJob[]>([]);
  const [completedJobs, setCompletedJobs] = useState<Set<string>>(new Set());
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);

  const loadActiveVersion = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('agent_releases')
        .select('version')
        .eq('is_active', true)
        .eq('platform', 'windows')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('Error loading active version:', error);
        return null;
      }

      return data?.version || null;
    } catch (error) {
      console.error('Error loading active version:', error);
      return null;
    }
  }, []);

  const loadAgentsStatus = useCallback(async () => {
    setIsLoading(true);
    try {
      // Load active version first
      const activeVersion = await loadActiveVersion();
      setCurrentVersion(activeVersion);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");
      if (!tenant) throw new Error("Tenant não selecionado");

      // Get all active agents - ADR-026: Use agents_safe view
      const { data: agentsData } = await supabase
        .from('agents_safe')
        .select('id, agent_name, agent_version, last_heartbeat')
        .eq('tenant_id', tenant.id)
        .eq('status', 'active')
        .is('archived_at', null)
        .order('agent_name');

      if (!agentsData) {
        setAgents([]);
        return;
      }

      // Check data completeness for each agent
      const agentsWithStatus = await Promise.all(
        agentsData.map(async (agent) => {
          const [softwareInventory, antivirusStatus, webActivity, vulnerabilities] = await Promise.all([
            supabase.from('software_inventory').select('id').eq('agent_id', agent.id).limit(1),
            supabase.from('antivirus_status').select('id').eq('agent_id', agent.id).limit(1),
            supabase.from('agent_web_activity').select('id').eq('agent_id', agent.id).limit(1),
            supabase.from('vuln_findings').select('id').eq('agent_id', agent.id).limit(1),
          ]);

          return {
            ...agent,
            hasSoftwareInventory: (softwareInventory.data?.length || 0) > 0,
            hasAntivirusStatus: (antivirusStatus.data?.length || 0) > 0,
            hasWebActivity: (webActivity.data?.length || 0) > 0,
            hasVulnerabilities: (vulnerabilities.data?.length || 0) > 0,
          };
        })
      );

      setAgents(agentsWithStatus);

      // Generate validation jobs based on missing data
      const jobs: ValidationJob[] = [];
      agentsWithStatus.forEach(agent => {
        // Check if agent needs update (only if we have a valid active version)
        if (activeVersion && agent.agent_version !== activeVersion) {
          jobs.push({
            agentId: agent.id,
            agentName: agent.agent_name,
            jobType: 'update_agent',
            label: `${agent.agent_name} - Update Agent`,
            reason: `Versão atual: ${agent.agent_version || 'desconhecida'} → ${activeVersion}`
          });
        }

        // Check missing data
        if (!agent.hasSoftwareInventory) {
          jobs.push({
            agentId: agent.id,
            agentName: agent.agent_name,
            jobType: 'software_inventory_collect',
            label: `${agent.agent_name} - Software Inventory`,
            reason: 'Sem dados de inventário de software'
          });
        }

        if (!agent.hasAntivirusStatus) {
          jobs.push({
            agentId: agent.id,
            agentName: agent.agent_name,
            jobType: 'collect_antivirus_status',
            label: `${agent.agent_name} - Antivirus Status`,
            reason: 'Sem dados de status de antivírus'
          });
        }

        if (!agent.hasWebActivity) {
          jobs.push({
            agentId: agent.id,
            agentName: agent.agent_name,
            jobType: 'collect_web_activity',
            label: `${agent.agent_name} - Web Activity`,
            reason: 'Sem dados de atividade web'
          });
        }

        if (!agent.hasVulnerabilities) {
          jobs.push({
            agentId: agent.id,
            agentName: agent.agent_name,
            jobType: 'light_vuln_scan',
            label: `${agent.agent_name} - Vulnerability Scan`,
            reason: 'Sem dados de vulnerabilidades'
          });
        }
      });

      setValidationJobs(jobs);
    } catch (error: any) {
      console.error('Error loading agents status:', error);
      toast.error('Erro ao carregar status dos agentes', {
        description: error.message
      });
    } finally {
      setIsLoading(false);
    }
  }, [loadActiveVersion]);

  useEffect(() => {
    loadAgentsStatus();
  }, [loadAgentsStatus]);

  const createValidationJobs = async () => {
    setIsCreating(true);
    const created = new Set<string>();

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");
      if (!tenant) throw new Error("Tenant não selecionado");

      // Create all jobs
      const jobsToCreate = validationJobs.map(vJob => {
        const agent = agents.find(a => a.id === vJob.agentId);
        if (!agent) return null;

        // Special payload for update_agent job
        const payload = vJob.jobType === 'update_agent' 
          ? { 
              current_version: agent.agent_version || 'unknown',
              target_version: currentVersion || 'latest'
            }
          : {};

        return {
          tenant_id: tenant.id,
          agent_id: agent.id,
          agent_name: agent.agent_name,
          type: vJob.jobType,
          status: 'queued',
          payload,
          approved: true
        };
      }).filter(Boolean);

      const jobsWithHash = await prepareJobsForInsert(jobsToCreate);
      const { error } = await supabase
        .from('jobs')
        .insert(jobsWithHash);

      if (error) throw error;

      // Mark all as completed
      validationJobs.forEach(job => {
        created.add(`${job.agentName}-${job.jobType}`);
      });

      setCompletedJobs(created);

      toast.success("Jobs de validação criados com sucesso", {
        description: `${jobsToCreate.length} jobs foram criados e serão processados pelos agentes`
      });

      // Reload status after a delay
      setTimeout(loadAgentsStatus, 3000);
    } catch (error: any) {
      console.error('Error creating validation jobs:', error);
      toast.error('Erro ao criar jobs de validação', {
        description: error.message
      });
    } finally {
      setIsCreating(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PlayCircle className="h-5 w-5" />
          Sistema de Validação Dinâmica
        </CardTitle>
        <CardDescription>
          Detecção automática de agentes e dados faltantes
          {currentVersion && (
            <span className="ml-2 text-xs text-primary">
              (Versão ativa: {currentVersion})
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm text-muted-foreground">
              {agents.length} agente(s) ativo(s) detectado(s)
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={loadAgentsStatus}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Atualizar Status
            </Button>
          </div>

          {validationJobs.length === 0 ? (
            <div className="flex items-center gap-2 p-4 border rounded-lg bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800">
              <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
              <div>
                <p className="text-sm font-medium text-green-900 dark:text-green-100">
                  Todos os agentes estão atualizados
                </p>
                <p className="text-xs text-green-700 dark:text-green-300">
                  Todos os agentes estão na versão {currentVersion || 'mais recente'} e têm dados completos
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 p-3 border rounded-lg bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-800">
                <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                <div>
                  <p className="text-sm font-medium text-yellow-900 dark:text-yellow-100">
                    {validationJobs.length} job(s) de validação necessário(s)
                  </p>
                  <p className="text-xs text-yellow-700 dark:text-yellow-300">
                    Alguns agentes precisam de atualização ou coleta de dados
                  </p>
                </div>
              </div>

              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {validationJobs.map((job) => {
                  const jobKey = `${job.agentName}-${job.jobType}`;
                  const isCompleted = completedJobs.has(jobKey);

                  return (
                    <div 
                      key={jobKey}
                      className="flex items-start justify-between p-3 border rounded-lg bg-card"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium">{job.label}</span>
                          <Badge variant="outline" className="text-xs">
                            {job.jobType}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{job.reason}</p>
                      </div>
                      {isCompleted && (
                        <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0 ml-2" />
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {validationJobs.length > 0 && (
          <>
            <Button
              onClick={createValidationJobs}
              disabled={isCreating || completedJobs.size === validationJobs.length}
              className="w-full"
            >
              {isCreating && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {completedJobs.size === validationJobs.length 
                ? "Jobs Criados" 
                : `Criar ${validationJobs.length} Job(s) de Validação`}
            </Button>

            {completedJobs.size > 0 && (
              <p className="text-xs text-muted-foreground text-center">
                {completedJobs.size} de {validationJobs.length} jobs criados
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
