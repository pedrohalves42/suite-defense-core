import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Trash2, Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { formatBrazilDateTime } from '@/lib/date-utils';
import { logger } from '@/lib/logger';

interface OrphanedJob {
  id: string;
  agent_name: string;
  type: string;
  created_at: string;
  status: string;
}

interface OrphanedJobsAlertProps {
  tenantId: string | null;
  onRefresh?: () => void;
}

export function OrphanedJobsAlert({ tenantId, onRefresh }: OrphanedJobsAlertProps) {
  const [orphanedJobs, setOrphanedJobs] = useState<OrphanedJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCancelling, setIsCancelling] = useState(false);

  useEffect(() => {
    if (!tenantId) return;

    const fetchOrphanedJobs = async () => {
      try {
        // ADR-026: Use RPC with explicit tenant_id to bypass JWT sync issues
        const { data: agentsRaw } = await supabase.rpc('get_agents_list', {
          p_tenant_id: tenantId,
          p_include_archived: false,
        });
        const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
        const offlineAgents = ((agentsRaw as any as Array<{ id: string; agent_name: string; last_heartbeat: string | null }>) || [])
          .filter(a => !a.last_heartbeat || a.last_heartbeat < thirtyMinutesAgo);

        if (!offlineAgents || offlineAgents.length === 0) {
          setOrphanedJobs([]);
          setLoading(false);
          return;
        }

        const offlineAgentIds = offlineAgents.map(a => a.id);

        // Get pending/queued jobs for offline agents
        const { data: jobs } = await supabase
          .from('jobs')
          .select('id, agent_name, type, created_at, status')
          .eq('tenant_id', tenantId)
          .in('agent_id', offlineAgentIds)
          .in('status', ['pending', 'queued', 'delivered'])
          .order('created_at', { ascending: false })
          .limit(50);

        setOrphanedJobs(jobs || []);
      } catch (error) {
        logger.error('Error fetching orphaned jobs:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchOrphanedJobs();
  }, [tenantId]);

  const handleCancelAll = async () => {
    if (!tenantId || orphanedJobs.length === 0) return;

    setIsCancelling(true);
    try {
      const jobIds = orphanedJobs.map(j => j.id);
      
      const { error } = await supabase
        .from('jobs')
        .update({ 
          status: 'cancelled',
          error_message: 'Cancelado - agente offline',
          completed_at: new Date().toISOString(),
        })
        .in('id', jobIds);

      if (error) throw error;

      toast({
        title: 'Jobs cancelados',
        description: `${jobIds.length} job(s) cancelado(s) com sucesso`,
      });

      setOrphanedJobs([]);
      onRefresh?.();
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Falha ao cancelar jobs',
        variant: 'destructive',
      });
    } finally {
      setIsCancelling(false);
    }
  };

  if (loading || orphanedJobs.length === 0) return null;

  // Group by agent
  const groupedByAgent = orphanedJobs.reduce((acc, job) => {
    const key = job.agent_name;
    if (!acc[key]) acc[key] = [];
    acc[key].push(job);
    return acc;
  }, {} as Record<string, OrphanedJob[]>);

  return (
    <Card className="border-orange-500/50 bg-orange-500/5">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-orange-500" />
            <CardTitle className="text-orange-600 dark:text-orange-400">
              Jobs Órfãos
            </CardTitle>
            <Badge variant="outline" className="bg-orange-500/20 text-orange-600 border-orange-500">
              {orphanedJobs.length} pendente(s)
            </Badge>
          </div>
          <Button 
            onClick={handleCancelAll} 
            variant="outline" 
            size="sm"
            disabled={isCancelling}
            className="text-orange-600 border-orange-500 hover:bg-orange-500/10"
          >
            <Trash2 className="w-4 h-4 mr-1" />
            {isCancelling ? 'Cancelando...' : 'Cancelar Todos'}
          </Button>
        </div>
        <CardDescription>
          Jobs pendentes para agentes que estão offline há mais de 30 minutos
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {Object.entries(groupedByAgent).map(([agentName, jobs]) => (
            <div key={agentName} className="p-3 bg-card border rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium">{agentName}</span>
                <Badge variant="secondary">{jobs.length} job(s)</Badge>
              </div>
              <div className="flex flex-wrap gap-1">
                {jobs.slice(0, 5).map(job => (
                  <Badge key={job.id} variant="outline" className="text-xs">
                    {job.type}
                  </Badge>
                ))}
                {jobs.length > 5 && (
                  <Badge variant="outline" className="text-xs">
                    +{jobs.length - 5} mais
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Mais antigo: {formatBrazilDateTime(jobs[jobs.length - 1].created_at, 'datetime')}
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
