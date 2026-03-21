import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle, CheckCircle, Clock, XCircle, TrendingDown, Cpu, Server } from 'lucide-react';

interface JobHealthStats {
  job_type: string;
  total: number;
  success: number;
  failed: number;
  pending: number;
  failure_rate: number;
}

interface ProblematicAgent {
  agent_id: string;
  agent_name: string;
  failed_jobs: number;
  total_jobs: number;
  failure_rate: number;
}

export default function JobHealthDashboard() {
  const { tenant } = useTenant();

  const { data: jobStats } = useQuery({
    queryKey: ['job-health-stats', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      
      const { data, error } = await supabase
        .from('job_executions')
        .select('id, status, created_at, agent_name, job_id')
        .eq('tenant_id', tenant.id)
        .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
      
      if (error) throw error;
      
      const statsMap: Record<string, JobHealthStats> = {};
      
      (data || []).forEach((job) => {
        const type = job.agent_name || 'unknown';
        if (!statsMap[type]) {
          statsMap[type] = { job_type: type, total: 0, success: 0, failed: 0, pending: 0, failure_rate: 0 };
        }
        statsMap[type].total++;
        if (job.status === 'completed') statsMap[type].success++;
        else if (job.status === 'failed') statsMap[type].failed++;
        else if (job.status === 'pending') statsMap[type].pending++;
      });
      
      Object.values(statsMap).forEach(stat => {
        stat.failure_rate = stat.total > 0 ? (stat.failed / stat.total) * 100 : 0;
      });
      
      return Object.values(statsMap).sort((a, b) => b.failure_rate - a.failure_rate);
    },
    enabled: !!tenant?.id,
  });

  const { data: problematicAgents } = useQuery({
    queryKey: ['problematic-agents-jobs', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      
      const { data, error } = await supabase
        .from('job_executions')
        .select(`
          agent_id,
          status,
          agents!inner(name)
        `)
        .eq('tenant_id', tenant.id)
        .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
      
      if (error) throw error;
      
      const agentMap: Record<string, ProblematicAgent> = {};
      
      data?.forEach((job: any) => {
        const agentId = job.agent_id;
        if (!agentId) return;
        
        if (!agentMap[agentId]) {
          agentMap[agentId] = {
            agent_id: agentId,
            agent_name: job.agents?.name || 'Unknown',
            failed_jobs: 0,
            total_jobs: 0,
            failure_rate: 0,
          };
        }
        agentMap[agentId].total_jobs++;
        if (job.status === 'failed') agentMap[agentId].failed_jobs++;
      });
      
      Object.values(agentMap).forEach(agent => {
        agent.failure_rate = agent.total_jobs > 0 
          ? (agent.failed_jobs / agent.total_jobs) * 100 
          : 0;
      });
      
      return Object.values(agentMap)
        .filter(a => a.failure_rate > 20)
        .sort((a, b) => b.failure_rate - a.failure_rate)
        .slice(0, 10);
    },
    enabled: !!tenant?.id,
  });

  const highFailureJobs = jobStats?.filter(s => s.failure_rate > 25) || [];
  const totalPending = jobStats?.reduce((acc, s) => acc + s.pending, 0) || 0;

  const getHealthColor = (rate: number) => {
    if (rate > 50) return 'text-destructive';
    if (rate > 25) return 'text-orange-500';
    if (rate > 10) return 'text-yellow-500';
    return 'text-green-500';
  };

  const getHealthBadge = (rate: number) => {
    if (rate > 50) return <Badge variant="destructive">Crítico</Badge>;
    if (rate > 25) return <Badge className="bg-orange-500">Alto</Badge>;
    if (rate > 10) return <Badge className="bg-yellow-500 text-black">Médio</Badge>;
    return <Badge className="bg-green-500">Saudável</Badge>;
  };

  const getSuggestedAction = (jobType: string, failureRate: number): string => {
    if (failureRate > 50) {
      if (jobType.includes('web_activity') || jobType.includes('collect_web')) {
        return 'Verificar conectividade de rede dos agentes ou permissões de coleta';
      }
      if (jobType.includes('software') || jobType.includes('inventory')) {
        return 'Verificar permissões de leitura do registro do Windows nos agentes';
      }
      if (jobType.includes('vuln') || jobType.includes('scan')) {
        return 'Verificar se o módulo de scan está instalado corretamente nos agentes';
      }
      return 'Investigar logs de falha para identificar causa raiz comum';
    }
    if (failureRate > 25) {
      return 'Monitorar nas próximas 24h e verificar agentes com mais falhas';
    }
    return 'Operação normal - nenhuma ação necessária';
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-destructive" />
              <div>
                <p className="text-2xl font-bold">{highFailureJobs.length}</p>
                <p className="text-sm text-muted-foreground">Jobs Problemáticos</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-yellow-500" />
              <div>
                <p className="text-2xl font-bold">{totalPending}</p>
                <p className="text-sm text-muted-foreground">Jobs Pendentes</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Server className="h-5 w-5 text-orange-500" />
              <div>
                <p className="text-2xl font-bold">{problematicAgents?.length || 0}</p>
                <p className="text-sm text-muted-foreground">Agentes Problemáticos</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Cpu className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">{jobStats?.length || 0}</p>
                <p className="text-sm text-muted-foreground">Tipos de Jobs</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Job Types Health */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Saúde por Tipo de Job</CardTitle>
          <CardDescription>Taxa de falha nos últimos 7 dias</CardDescription>
        </CardHeader>
        <CardContent>
          {!jobStats?.length ? (
            <p className="text-muted-foreground">Nenhum dado de jobs encontrado</p>
          ) : (
            <div className="space-y-4">
              {jobStats.map(stat => (
                <div key={stat.job_type} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{stat.job_type}</span>
                      {getHealthBadge(stat.failure_rate)}
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="flex items-center gap-1 text-green-600">
                        <CheckCircle className="h-3 w-3" />
                        {stat.success}
                      </span>
                      <span className="flex items-center gap-1 text-destructive">
                        <XCircle className="h-3 w-3" />
                        {stat.failed}
                      </span>
                      <span className="flex items-center gap-1 text-yellow-600">
                        <Clock className="h-3 w-3" />
                        {stat.pending}
                      </span>
                      <span className={`font-medium ${getHealthColor(stat.failure_rate)}`}>
                        {stat.failure_rate.toFixed(1)}% falha
                      </span>
                    </div>
                  </div>
                  <Progress 
                    value={100 - stat.failure_rate} 
                    className="h-2"
                  />
                  {stat.failure_rate > 20 && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3 text-orange-500" />
                      {getSuggestedAction(stat.job_type, stat.failure_rate)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Problematic Agents */}
      {problematicAgents && problematicAgents.length > 0 && (
        <Card className="border-orange-500/50">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              Agentes com Alta Taxa de Falha
            </CardTitle>
            <CardDescription>
              Agentes com mais de 20% de falha nos jobs nos últimos 7 dias
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {problematicAgents.map(agent => (
                <div key={agent.agent_id} className="flex items-center justify-between p-3 rounded-lg border">
                  <div>
                    <span className="font-medium">{agent.agent_name}</span>
                    <p className="text-xs text-muted-foreground">
                      {agent.failed_jobs} falhas de {agent.total_jobs} jobs
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`font-bold ${getHealthColor(agent.failure_rate)}`}>
                      {agent.failure_rate.toFixed(1)}%
                    </span>
                    {getHealthBadge(agent.failure_rate)}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
