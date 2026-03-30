import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AdminPageLayout } from '@/components/AdminPageLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { 
  Clock, Play, CheckCircle, XCircle, AlertTriangle, 
  Zap, Bot, RefreshCw, Calendar, Timer
} from 'lucide-react';
import { format, formatDistanceToNow, ptBR } from '@/lib/date-utils';
import { useTenant } from '@/hooks/useTenant';
import { toast } from 'sonner';
import { callEdgeFunction } from '@/lib/edge-function-client';
import { logger } from '@/lib/logger';

interface ScheduledJob {
  id: string;
  name: string;
  description: string | null;
  job_type: string;
  cron_expr: string;
  enabled: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  created_at: string;
}

interface Playbook {
  id: string;
  name: string;
  description: string | null;
  trigger_type: string;
  is_enabled: boolean;
  severity: string | null;
  created_at: string;
}

export default function Automations() {
  const { tenant } = useTenant();
  const [executingJob, setExecutingJob] = useState<string | null>(null);

  // Fetch scheduled jobs
  const { data: scheduledJobs, isLoading: loadingJobs, refetch: refetchJobs } = useQuery({
    queryKey: ['scheduled-jobs', tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('scheduled_jobs')
        .select('id, tenant_id, name, description, cron_expr, job_type, enabled, last_run_at, next_run_at, created_at, updated_at')
        .eq('tenant_id', tenant!.id)
        .order('name');
      if (error) throw error;
      return data as ScheduledJob[];
    },
    enabled: !!tenant?.id
  });

  // Fetch playbooks
  const { data: playbooks, isLoading: loadingPlaybooks } = useQuery({
    queryKey: ['playbooks-list', tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('playbooks')
        .select('id, tenant_id, name, description, trigger_type, execution_mode, is_enabled, severity, require_approval, cooldown_minutes, version, created_at, updated_at')
        .eq('tenant_id', tenant!.id)
        .order('name');
      if (error) throw error;
      return data as Playbook[];
    },
    enabled: !!tenant?.id
  });

  // Fetch job execution stats from job_executions table
  const { data: jobStats } = useQuery({
    queryKey: ['job-execution-stats', tenant?.id],
    queryFn: async () => {
      // Use jobs table to get job types and join with job_executions
      const { data: jobs } = await supabase
        .from('jobs')
        .select('id, type')
        .eq('tenant_id', tenant!.id);

      const { data: executions } = await supabase
        .from('job_executions')
        .select('job_id, status')
        .eq('tenant_id', tenant!.id)
        .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
      
      if (!jobs || !executions) return {};

      const jobTypeMap = new Map(jobs.map(j => [j.id, j.type]));
      const stats: Record<string, { total: number; success: number; failed: number }> = {};
      
      for (const exec of executions) {
        const jobType = jobTypeMap.get(exec.job_id) || 'unknown';
        if (!stats[jobType]) {
          stats[jobType] = { total: 0, success: 0, failed: 0 };
        }
        stats[jobType].total++;
        if (exec.status === 'success' || exec.status === 'completed') stats[jobType].success++;
        else if (exec.status === 'failed' || exec.status === 'error') stats[jobType].failed++;
      }
      return stats;
    },
    enabled: !!tenant?.id
  });

  // Map job types to edge functions
  const jobToEdgeFunction: Record<string, string> = {
    'autonomous_safe_mode': 'cron-autonomous-safe-mode',
    'auto_cleanup': 'cron-auto-cleanup-jobs',
    'auto_execute_ai': 'cron-auto-execute-ai-actions',
    'watchdog_non_execution': 'cron-watchdog-non-execution',
    'ai_system_analyzer': 'ai-system-analyzer',
    'integrity_sentinel': 'integrity-sentinel',
    'scheduled_reports': 'scheduled-report-generator',
    'detect_blocked_attempts': 'detect-blocked-attempts',
    'ai_insight_generator': 'ai-insight-generator',
    'scan_vulnerabilities': 'scan-vulnerabilities'
  };

  const executeJobManually = async (job: ScheduledJob) => {
    const edgeFunction = jobToEdgeFunction[job.job_type];
    if (!edgeFunction) {
      toast.error('Função não encontrada para este job');
      return;
    }

    setExecutingJob(job.id);
    try {
      await callEdgeFunction(edgeFunction, { 
        tenant_id: tenant?.id,
        mode: job.job_type === 'scan_vulnerabilities' ? 'batch_all_agents' : undefined
      });
      toast.success(`Job "${job.name}" executado com sucesso`);
      refetchJobs();
    } catch (error) {
      logger.error('Error executing job:', error);
      toast.error('Erro ao executar job');
    } finally {
      setExecutingJob(null);
    }
  };

  const toggleJobEnabled = async (job: ScheduledJob) => {
    // V-1064 FIX: Add tenant_id filter
    const { error } = await supabase
      .from('scheduled_jobs')
      .update({ enabled: !job.enabled })
      .eq('id', job.id)
      .eq('tenant_id', tenant!.id);
    
    if (error) {
      toast.error('Erro ao atualizar job');
    } else {
      toast.success(job.enabled ? 'Job desativado' : 'Job ativado');
      refetchJobs();
    }
  };

  const getJobIcon = (jobType: string) => {
    switch (jobType) {
      case 'autonomous_safe_mode':
      case 'auto_execute_ai':
        return <Bot className="h-4 w-4" />;
      case 'auto_cleanup':
        return <RefreshCw className="h-4 w-4" />;
      case 'watchdog_non_execution':
        return <AlertTriangle className="h-4 w-4" />;
      case 'ai_system_analyzer':
      case 'ai_insight_generator':
        return <Zap className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  const getSeverityColor = (severity: string | null) => {
    switch (severity?.toLowerCase()) {
      case 'critical': return 'destructive';
      case 'high': return 'destructive';
      case 'medium': return 'secondary';
      default: return 'outline';
    }
  };

  const enabledJobs = scheduledJobs?.filter(j => j.enabled).length || 0;
  const enabledPlaybooks = playbooks?.filter(p => p.is_enabled).length || 0;

  return (
    <AdminPageLayout
      title="Automações"
      description="Gerencie jobs agendados, playbooks e automações do sistema"
    >
      {/* Summary Cards */}
      <StatsGrid columns={4} className="mb-6">
        <SummaryStatCard icon={Clock} value={scheduledJobs?.length || 0} label="Jobs Agendados" accent="primary" />
        <SummaryStatCard icon={CheckCircle} value={enabledJobs} label="Jobs Ativos" accent="success" />
        <SummaryStatCard icon={Zap} value={playbooks?.length || 0} label="Playbooks" accent="info" />
        <SummaryStatCard icon={Bot} value={enabledPlaybooks} label="Playbooks Ativos" accent="info" />
      </StatsGrid>

      <Tabs defaultValue="jobs" className="space-y-4">
        <TabsList>
          <TabsTrigger value="jobs">
            <Clock className="h-4 w-4 mr-2" />
            Jobs Agendados
          </TabsTrigger>
          <TabsTrigger value="playbooks">
            <Zap className="h-4 w-4 mr-2" />
            Playbooks
          </TabsTrigger>
          <TabsTrigger value="stats">
            <Calendar className="h-4 w-4 mr-2" />
            Estatísticas
          </TabsTrigger>
        </TabsList>

        {/* Scheduled Jobs Tab */}
        <TabsContent value="jobs">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Jobs Agendados
              </CardTitle>
              <CardDescription>
                Tarefas automáticas executadas pelo sistema em intervalos regulares
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingJobs ? (
                <div className="flex justify-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : scheduledJobs && scheduledJobs.length > 0 ? (
                <div className="space-y-3">
                  {scheduledJobs.map((job) => (
                    <div 
                      key={job.id} 
                      className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className={`p-2 rounded-lg ${job.enabled ? 'bg-primary/10' : 'bg-muted'}`}>
                          {getJobIcon(job.job_type)}
                        </div>
                        <div>
                        <div className="flex items-center gap-2 mb-2">
                              <p className="font-medium">{job.name}</p>
                              <Badge variant={job.enabled ? 'default' : 'secondary'}>
                                {job.enabled ? 'Ativo' : 'Inativo'}
                              </Badge>
                            </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                            <span className="flex items-center gap-1">
                              <Timer className="h-3 w-3" />
                              {job.cron_expr}
                            </span>
                            {job.last_run_at && (
                              <span>
                                Última execução: {formatDistanceToNow(new Date(job.last_run_at), { addSuffix: true, locale: ptBR })}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Switch 
                          checked={job.enabled} 
                          onCheckedChange={() => toggleJobEnabled(job)}
                        />
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => executeJobManually(job)}
                          disabled={executingJob === job.id || !job.enabled}
                        >
                          {executingJob === job.id ? (
                            <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                          ) : (
                            <Play className="h-4 w-4 mr-2" />
                          )}
                          Executar
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Nenhum job agendado encontrado</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Playbooks Tab */}
        <TabsContent value="playbooks">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5" />
                Playbooks Automáticos
              </CardTitle>
              <CardDescription>
                Ações automáticas executadas quando condições específicas são detectadas
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingPlaybooks ? (
                <div className="flex justify-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : playbooks && playbooks.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {playbooks.map((playbook) => (
                    <Card key={playbook.id} className="border">
                      <CardContent className="pt-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <Zap className={`h-4 w-4 ${playbook.is_enabled ? 'text-primary' : 'text-muted-foreground'}`} />
                              <span className="font-medium">{playbook.name}</span>
                              {playbook.severity && (
                                <Badge variant={getSeverityColor(playbook.severity) as "default" | "destructive" | "outline" | "secondary"}>
                                  {playbook.severity}
                                </Badge>
                              )}
                            </div>
                            {playbook.description && (
                              <p className="text-sm text-muted-foreground mb-2">
                                {playbook.description}
                              </p>
                            )}
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">
                                Trigger: {playbook.trigger_type}
                              </Badge>
                              <Badge variant={playbook.is_enabled ? 'default' : 'secondary'} className="text-xs">
                                {playbook.is_enabled ? 'Ativo' : 'Inativo'}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Zap className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Nenhum playbook configurado</p>
                  <Button variant="outline" className="mt-4" asChild>
                    <a href="/admin/playbooks">Configurar Playbooks</a>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Stats Tab */}
        <TabsContent value="stats">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Estatísticas de Execução (últimos 7 dias)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {jobStats && Object.keys(jobStats).length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {Object.entries(jobStats).map(([jobType, stats]) => (
                    <Card key={jobType} className="border">
                      <CardContent className="pt-4">
                        <div className="flex items-center gap-2 mb-3">
                          {getJobIcon(jobType)}
                          <span className="font-medium text-sm">{jobType}</span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div>
                            <p className="text-2xl font-bold">{stats.total}</p>
                            <p className="text-xs text-muted-foreground">Total</p>
                          </div>
                          <div>
                            <p className="text-2xl font-bold text-green-500">{stats.success}</p>
                            <p className="text-xs text-muted-foreground">Sucesso</p>
                          </div>
                          <div>
                            <p className="text-2xl font-bold text-destructive">{stats.failed}</p>
                            <p className="text-xs text-muted-foreground">Falha</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Nenhuma execução registrada nos últimos 7 dias</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </AdminPageLayout>
  );
}
