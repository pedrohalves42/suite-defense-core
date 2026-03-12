import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { AlertTriangle, Clock, RefreshCw, Trash2, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { formatRelativeTimePt } from '@/lib/agent-utils';
import { formatBrazilDateTime } from '@/lib/date-utils';
import { JobStatusSimplified } from '@/components/admin/JobStatusSimplified';

interface StuckJob {
  id: string;
  agent_name: string;
  type: string;
  status: string;
  delivered_at: string;
  minutes_stuck: number;
}

export function JobsMonitor() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: stuckJobs, isLoading, refetch } = useQuery({
    queryKey: ['stuck-jobs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('jobs')
        .select('id, agent_name, type, status, delivered_at, created_at')
        .eq('status', 'delivered')
        .not('delivered_at', 'is', null)
        .order('delivered_at', { ascending: true })
        .limit(20);

      if (error) throw error;

      // Calculate minutes stuck
      return (data || []).map(job => ({
        ...job,
        minutes_stuck: job.delivered_at 
          ? Math.round((Date.now() - new Date(job.delivered_at).getTime()) / 60000)
          : 0
      })) as StuckJob[];
    },
    refetchInterval: 120000, // COST-OPT: 30s → 2min
  });

  const cancelJob = useMutation({
    mutationFn: async (jobId: string) => {
      // V-1060 FIX: Add tenant_id filter via RLS (jobs table has RLS enabled)
      const { error } = await supabase
        .from('jobs')
        .update({ 
          status: 'failed', 
          error_message: 'Cancelado manualmente pelo administrador',
          completed_at: new Date().toISOString()
        })
        .eq('id', jobId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stuck-jobs'] });
      toast({ title: 'Job cancelado com sucesso' });
    },
    onError: (error) => {
      toast({ 
        title: 'Erro ao cancelar job', 
        description: error instanceof Error ? error.message : 'Erro desconhecido',
        variant: 'destructive' 
      });
    }
  });

  const getJobTypeName = (type: string) => {
    const names: Record<string, string> = {
      'software_inventory_collect': 'Inventário de Software',
      'light_vuln_scan': 'Verificação de Vulnerabilidades',
      'collect_antivirus_status': 'Status do Antivírus',
      'collect_web_activity': 'Atividade Web',
      'collect_network_info': 'Informações de Rede',
      'update_agent': 'Atualização do Agente',
      'fix_firewall': 'Correção de Firewall',
      'report': 'Relatório',
    };
    return names[type] || type;
  };

  const getStuckSeverity = (minutes: number) => {
    if (minutes >= 60) return { color: 'text-red-500 bg-red-500/10', label: 'Crítico' };
    if (minutes >= 30) return { color: 'text-yellow-500 bg-yellow-500/10', label: 'Atenção' };
    return { color: 'text-blue-500 bg-blue-500/10', label: 'Aguardando' };
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-32">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const hasStuckJobs = stuckJobs && stuckJobs.length > 0;
  const criticalJobs = stuckJobs?.filter(j => j.minutes_stuck >= 60) || [];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Jobs em Andamento
              {criticalJobs.length > 0 && (
                <Badge variant="destructive" className="ml-2">
                  {criticalJobs.length} travado(s)
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Jobs entregues aos agentes aguardando resposta
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Atualizar
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!hasStuckJobs ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <CheckCircle className="h-12 w-12 text-green-500 mb-3" />
            <p className="font-medium">Nenhum job em andamento</p>
            <p className="text-sm text-muted-foreground">
              Todos os jobs foram processados pelos agentes
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {stuckJobs.map((job) => {
              const severity = getStuckSeverity(job.minutes_stuck);
              return (
                <div 
                  key={job.id}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <JobStatusSimplified 
                      status={job.status} 
                      errorMessage={job.minutes_stuck >= 60 ? 'Job travado há mais de 1 hora' : undefined}
                    />
                    <div>
                      <p className="font-medium text-sm">{job.agent_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {getJobTypeName(job.type)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <Badge variant="outline" className={severity.color}>
                        {job.minutes_stuck} min
                      </Badge>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatBrazilDateTime(job.delivered_at)}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => cancelJob.mutate(job.id)}
                      disabled={cancelJob.isPending}
                    >
                      <XCircle className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                    </Button>
                  </div>
                </div>
              );
            })}
            
            {criticalJobs.length > 0 && (
              <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                <p className="text-sm text-yellow-600 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>
                    <strong>{criticalJobs.length} job(s)</strong> travado(s) há mais de 1 hora.
                    Isso pode indicar que o agente está offline ou com problemas de comunicação.
                    Verifique se os computadores estão ligados e conectados à internet.
                  </span>
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
