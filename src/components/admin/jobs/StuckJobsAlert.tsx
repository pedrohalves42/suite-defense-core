import { useState } from 'react';
import { AlertTriangle, Clock, RefreshCw, XCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { formatDistanceToNow, ptBR } from '@/lib/date-utils';
import { logger } from '@/lib/logger';

interface StuckJob {
  id: string;
  type: string;
  agent_name: string;
  status: string;
  created_at: string;
  delivered_at: string;
}

interface StuckJobsAlertProps {
  stuckJobs: StuckJob[];
  onRefresh: () => void;
}

// Job type labels
const jobTypeLabels: Record<string, string> = {
  'health_report': 'Relatório de Saúde',
  'software_inventory_collect': 'Inventário de Software',
  'light_vuln_scan': 'Análise de Vulnerabilidades',
  'collect_antivirus_status': 'Status do Antivírus',
  'collect_web_activity': 'Atividade Web',
};

export function StuckJobsAlert({ stuckJobs, onRefresh }: StuckJobsAlertProps) {
  const [cancellingIds, setCancellingIds] = useState<Set<string>>(new Set());

  if (!stuckJobs.length) {
    return null;
  }

  const handleCancelJob = async (jobId: string) => {
    setCancellingIds(prev => new Set(prev).add(jobId));
    try {
      const { error } = await supabase
        .from('jobs')
        .update({
          status: 'cancelled',
          error_message: 'Cancelado manualmente pelo operador (job travado)',
          completed_at: new Date().toISOString(),
        })
        .eq('id', jobId);

      if (error) throw error;
      toast.success('Job cancelado com sucesso');
      onRefresh();
    } catch (error) {
      logger.error('Error cancelling job:', error);
      toast.error('Erro ao cancelar job');
    } finally {
      setCancellingIds(prev => {
        const next = new Set(prev);
        next.delete(jobId);
        return next;
      });
    }
  };

  const handleCancelAll = async () => {
    const jobIds = stuckJobs.map(j => j.id);
    setCancellingIds(new Set(jobIds));
    
    try {
      const { error } = await supabase
        .from('jobs')
        .update({
          status: 'cancelled',
          error_message: 'Cancelado em lote pelo operador (job travado)',
          completed_at: new Date().toISOString(),
        })
        .in('id', jobIds);

      if (error) throw error;
      toast.success(`${jobIds.length} jobs cancelados`);
      onRefresh();
    } catch (error) {
      logger.error('Error cancelling jobs:', error);
      toast.error('Erro ao cancelar jobs');
    } finally {
      setCancellingIds(new Set());
    }
  };

  return (
    <Alert variant="destructive" className="mb-6">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle className="flex items-center justify-between">
        <span>{stuckJobs.length} Jobs Travados Detectados</span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            className="gap-1"
          >
            <RefreshCw className="h-3 w-3" />
            Atualizar
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleCancelAll}
            disabled={cancellingIds.size > 0}
            className="gap-1"
          >
            <XCircle className="h-3 w-3" />
            Cancelar Todos
          </Button>
        </div>
      </AlertTitle>
      <AlertDescription className="mt-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tipo</TableHead>
              <TableHead>Agente</TableHead>
              <TableHead>Tempo Travado</TableHead>
              <TableHead className="text-right">Ação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {stuckJobs.slice(0, 5).map((job) => (
              <TableRow key={job.id}>
                <TableCell>
                  <Badge variant="outline">
                    {jobTypeLabels[job.type] || job.type}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono text-sm">
                  {job.agent_name}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {formatDistanceToNow(new Date(job.delivered_at), { 
                      locale: ptBR,
                      addSuffix: true,
                    })}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCancelJob(job.id)}
                    disabled={cancellingIds.has(job.id)}
                    className="text-destructive hover:text-destructive"
                  >
                    {cancellingIds.has(job.id) ? (
                      <RefreshCw className="h-3 w-3 animate-spin" />
                    ) : (
                      <XCircle className="h-3 w-3" />
                    )}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {stuckJobs.length > 5 && (
          <p className="text-sm text-muted-foreground mt-2">
            + {stuckJobs.length - 5} jobs travados adicionais
          </p>
        )}
      </AlertDescription>
    </Alert>
  );
}
