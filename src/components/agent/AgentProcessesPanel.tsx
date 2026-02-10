/**
 * AgentProcessesPanel - Exibe top processos e anomalias
 * 
 * Mostra:
 * - Top 5 processos por CPU
 * - Top 5 processos por RAM
 * - Processos anômalos detectados
 * - Estatísticas de auto-reparo
 */

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Cpu, 
  MemoryStick, 
  AlertTriangle, 
  Wrench, 
  HardDrive,
  Zap,
  Clock
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow, ptBR } from '@/lib/date-utils';

interface Process {
  name: string;
  pid?: number;
  cpu_seconds?: number;
  memory_mb: number;
}

interface ProcessesData {
  top_by_cpu: Process[];
  top_by_memory: Process[];
  total_processes: number;
  collected_at: string;
}

interface AutoRepairStats {
  disk_cleanups: number;
  processes_killed: number;
  last_disk_cleanup: string | null;
  last_process_kill: string | null;
}

interface AgentProcessesPanelProps {
  agentId: string;
  tenantId?: string;
}

export function AgentProcessesPanel({ agentId, tenantId }: AgentProcessesPanelProps) {
  // Buscar último heartbeat com dados de processos
  const { data, isLoading, isError } = useQuery({
    queryKey: ['agent-processes', agentId],
    queryFn: async () => {
      // Buscar do agent_evidence_logs os dados mais recentes de processos
      const { data: evidenceLogs, error } = await supabase
        .from('agent_evidence_logs')
        .select('event_data, created_at')
        .eq('agent_id', agentId)
        .in('event_type', ['heartbeat', 'processes'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (error) throw error;
      
      // Parse dos dados do evento
      if (evidenceLogs?.event_data) {
        const eventData = evidenceLogs.event_data as Record<string, unknown>;
        return {
          processes: eventData.processes as ProcessesData | null,
          anomalies: (eventData.process_anomalies as string[]) || [],
          autoRepairStats: eventData.auto_repair_stats as AutoRepairStats | null,
          collectedAt: evidenceLogs.created_at
        };
      }
      
      return null;
    },
    enabled: !!agentId,
    staleTime: 30000, // 30 segundos
    refetchInterval: 60000 // Refetch a cada 60 segundos
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="text-center py-8 px-4">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted/50 flex items-center justify-center">
          <Cpu className="h-8 w-8 text-muted-foreground/50" />
        </div>
        <h3 className="font-medium text-foreground mb-2">Monitoramento de Processos</h3>
        <p className="text-sm text-muted-foreground mb-3">
          Dados de processos serão exibidos aqui quando disponíveis.
        </p>
        <div className="text-xs text-muted-foreground space-y-1">
          <p className="flex items-center justify-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-primary/50" />
            Requer agente versão 5.0 ou superior
          </p>
          <p className="flex items-center justify-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-primary/50" />
            O agente coleta CPU, memória e processos ativos
          </p>
        </div>
      </div>
    );
  }

  const { processes, anomalies, autoRepairStats, collectedAt } = data;

  return (
    <div className="space-y-4">
      {/* Header com timestamp */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {collectedAt && formatDistanceToNow(new Date(collectedAt), { addSuffix: true, locale: ptBR })}
        </span>
        {processes?.total_processes && (
          <Badge variant="outline" className="text-xs">
            {processes.total_processes} processos
          </Badge>
        )}
      </div>

      {/* Top Processos por CPU */}
      {processes?.top_by_cpu && processes.top_by_cpu.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Cpu className="h-4 w-4 text-orange-500" />
              Top CPU
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {processes.top_by_cpu.slice(0, 5).map((proc, idx) => (
              <div key={`cpu-${idx}`} className="flex items-center justify-between text-sm">
                <span className="truncate flex-1 mr-2 font-mono text-xs">
                  {proc.name}
                </span>
                <span className="text-muted-foreground text-xs">
                  {proc.cpu_seconds?.toFixed(1)}s
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Top Processos por RAM */}
      {processes?.top_by_memory && processes.top_by_memory.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <MemoryStick className="h-4 w-4 text-blue-500" />
              Top Memória
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {processes.top_by_memory.slice(0, 5).map((proc, idx) => (
              <div key={`mem-${idx}`} className="flex items-center justify-between text-sm">
                <span className="truncate flex-1 mr-2 font-mono text-xs">
                  {proc.name}
                </span>
                <span className="text-muted-foreground text-xs">
                  {proc.memory_mb.toFixed(0)} MB
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {anomalies && anomalies.length > 0 && (
        <Card className="border-warning/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-yellow-600">
              <AlertTriangle className="h-4 w-4" />
              Processos Anômalos ({anomalies.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1">
              {anomalies.map((proc, idx) => (
                <Badge key={idx} variant="outline" className="text-xs border-yellow-500/50 text-yellow-600">
                  {proc}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Estatísticas de Auto-Reparo */}
      {autoRepairStats && (autoRepairStats.disk_cleanups > 0 || autoRepairStats.processes_killed > 0) && (
        <Card className="border-green-500/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-green-600">
              <Wrench className="h-4 w-4" />
              Auto-Reparo Ativo
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {autoRepairStats.disk_cleanups > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-sm flex items-center gap-2">
                  <HardDrive className="h-3.5 w-3.5 text-muted-foreground" />
                  Limpezas de disco
                </span>
                <Badge variant="secondary">{autoRepairStats.disk_cleanups}</Badge>
              </div>
            )}
            {autoRepairStats.processes_killed > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-sm flex items-center gap-2">
                  <Zap className="h-3.5 w-3.5 text-muted-foreground" />
                  Processos encerrados
                </span>
                <Badge variant="secondary">{autoRepairStats.processes_killed}</Badge>
              </div>
            )}
            {autoRepairStats.last_disk_cleanup && (
              <p className="text-xs text-muted-foreground">
                Última limpeza: {formatDistanceToNow(new Date(autoRepairStats.last_disk_cleanup), { addSuffix: true, locale: ptBR })}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Mensagem quando não há dados relevantes */}
      {(!processes || !processes.top_by_cpu?.length) && (!anomalies || !anomalies.length) && (!autoRepairStats || (!autoRepairStats.disk_cleanups && !autoRepairStats.processes_killed)) && (
        <div className="text-center py-8 px-4">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted/50 flex items-center justify-center">
            <Cpu className="h-8 w-8 text-muted-foreground/50" />
          </div>
          <h3 className="font-medium text-foreground mb-2">Aguardando Dados</h3>
          <p className="text-sm text-muted-foreground mb-3">
            O próximo heartbeat trará informações de processos.
          </p>
          <div className="text-xs text-muted-foreground space-y-1">
            <p className="flex items-center justify-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-primary/50" />
              Coleta automática a cada 5 minutos
            </p>
            <p className="flex items-center justify-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-primary/50" />
              Requer agente versão 5.0+
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
