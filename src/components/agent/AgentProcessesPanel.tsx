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
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Cpu, 
  MemoryStick, 
  AlertTriangle, 
  Wrench, 
  HardDrive,
  Zap,
  Clock,
  Activity
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow, ptBR } from '@/lib/date-utils';
import { cn } from '@/lib/utils';
import { useAdaptivePolling } from '@/hooks/useAdaptivePolling';

interface Process {
  name: string;
  pid?: number;
  cpu_seconds?: number;
  cpu_percent?: number;
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

function formatMemory(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${Math.round(mb)} MB`;
}

function getMemoryColor(mb: number): string {
  if (mb >= 500) return 'bg-red-500';
  if (mb >= 200) return 'bg-amber-500';
  return 'bg-blue-500';
}

function getCpuColor(val: number): string {
  if (val >= 50) return 'bg-red-500';
  if (val >= 20) return 'bg-amber-500';
  return 'bg-orange-500';
}

export function AgentProcessesPanel({ agentId, tenantId }: AgentProcessesPanelProps) {
  const adaptiveInterval = useAdaptivePolling(300000);
  const { data, isLoading, isError } = useQuery({
    queryKey: ['agent-processes', agentId],
    queryFn: async () => {
      const { data: processData, error } = await supabase
        .from('agent_processes')
        .select('id, agent_id, processes, collected_at, total_processes, suspicious_processes')
        .eq('agent_id', agentId)
        .order('collected_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (error) throw error;
      if (!processData) return null;

      const rawProcesses = (processData.processes as Array<Record<string, unknown>> | null) ?? [];
      const top_by_cpu = [...rawProcesses]
        .sort((a, b) => (Number(b.cpu_percent || b.cpu || b.cpu_seconds || 0)) - (Number(a.cpu_percent || a.cpu || a.cpu_seconds || 0)))
        .slice(0, 5)
        .map((p) => ({
          name: typeof p.name === 'string' ? p.name : 'Processo desconhecido',
          pid: typeof p.pid === 'number' ? p.pid : undefined,
          cpu_seconds: Number(p.cpu || p.cpu_seconds || 0),
          cpu_percent: Number(p.cpu_percent || 0),
          memory_mb: Number(p.memory_mb || 0),
        }));
      const top_by_memory = [...rawProcesses]
        .sort((a, b) => Number(b.memory_mb || 0) - Number(a.memory_mb || 0))
        .slice(0, 5)
        .map((p) => ({
          name: typeof p.name === 'string' ? p.name : 'Processo desconhecido',
          pid: typeof p.pid === 'number' ? p.pid : undefined,
          cpu_seconds: Number(p.cpu || p.cpu_seconds || 0),
          cpu_percent: Number(p.cpu_percent || 0),
          memory_mb: Number(p.memory_mb || 0),
        }));

      const suspicious = ((processData.suspicious_processes as Array<Record<string, unknown>> | null) ?? [])
        .map((item) => {
          const name = [item.name, item.process_name, item.image_name]
            .find((value): value is string => typeof value === 'string' && value.trim().length > 0)
            ?.trim();

          const reason = [item.reason, item.command_line, item.path]
            .find((value): value is string => typeof value === 'string' && value.trim().length > 0)
            ?.trim() ?? '';

          if (!name) return null;

          return { name, reason };
        })
        .filter((item): item is { name: string; reason: string } => item !== null);

      return {
        processes: {
          top_by_cpu,
          top_by_memory,
          total_processes: processData.total_processes || rawProcesses.length,
          collected_at: processData.collected_at,
        } as ProcessesData,
        anomalies: suspicious,
        autoRepairStats: null as AutoRepairStats | null,
        collectedAt: processData.collected_at,
      };
    },
    enabled: !!agentId,
    staleTime: 30000,
    refetchInterval: adaptiveInterval,
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

  const maxMemory = processes?.top_by_memory?.[0]?.memory_mb || 1;
  const maxCpu = processes?.top_by_cpu?.[0]?.cpu_percent || processes?.top_by_cpu?.[0]?.cpu_seconds || 1;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          {collectedAt
            ? `Atualizado ${formatDistanceToNow(new Date(collectedAt), { addSuffix: true, locale: ptBR })}`
            : 'Sem dados'}
        </span>
        {processes?.total_processes != null && (
          <Badge variant="secondary" className="text-xs font-mono">
            <Activity className="h-3 w-3 mr-1" />
            {processes.total_processes} processos
          </Badge>
        )}
      </div>

      {/* Top CPU */}
      {processes?.top_by_cpu && processes.top_by_cpu.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <div className="flex items-center justify-center w-6 h-6 rounded-md bg-orange-500/15">
              <Cpu className="h-3.5 w-3.5 text-orange-500" />
            </div>
            <h4 className="text-sm font-semibold text-foreground">Top CPU</h4>
          </div>
          <div className="space-y-1.5">
            {processes.top_by_cpu.map((proc, idx) => {
              const cpuVal = proc.cpu_percent || proc.cpu_seconds || 0;
              const barWidth = maxCpu > 0 ? Math.max(4, (cpuVal / maxCpu) * 100) : 4;
              const hasCpuPercent = proc.cpu_percent != null && proc.cpu_percent > 0;

              return (
                <div
                  key={`cpu-${idx}`}
                  className="group relative flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-muted/50 transition-colors"
                >
                  {/* Rank */}
                  <span className="text-[10px] font-bold text-muted-foreground/60 w-4 text-center tabular-nums">
                    {idx + 1}
                  </span>

                  {/* Name + bar */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-mono truncate text-foreground">
                        {proc.name}
                      </span>
                      <span className={cn(
                        "text-xs font-semibold tabular-nums ml-2 whitespace-nowrap",
                        cpuVal >= 50 ? "text-red-400" : cpuVal >= 20 ? "text-amber-400" : "text-muted-foreground"
                      )}>
                        {hasCpuPercent ? `${cpuVal.toFixed(1)}%` : `${cpuVal.toFixed(1)}s`}
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-muted/60 rounded-full overflow-hidden">
                      <div
                        className={cn("h-full rounded-full transition-all duration-500", getCpuColor(cpuVal))}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Top Memória */}
      {processes?.top_by_memory && processes.top_by_memory.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <div className="flex items-center justify-center w-6 h-6 rounded-md bg-blue-500/15">
              <MemoryStick className="h-3.5 w-3.5 text-blue-500" />
            </div>
            <h4 className="text-sm font-semibold text-foreground">Top Memória</h4>
          </div>
          <div className="space-y-1.5">
            {processes.top_by_memory.map((proc, idx) => {
              const barWidth = maxMemory > 0 ? Math.max(4, (proc.memory_mb / maxMemory) * 100) : 4;

              return (
                <div
                  key={`mem-${idx}`}
                  className="group relative flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-muted/50 transition-colors"
                >
                  <span className="text-[10px] font-bold text-muted-foreground/60 w-4 text-center tabular-nums">
                    {idx + 1}
                  </span>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-mono truncate text-foreground">
                        {proc.name}
                      </span>
                      <span className={cn(
                        "text-xs font-semibold tabular-nums ml-2 whitespace-nowrap",
                        proc.memory_mb >= 500 ? "text-red-400" : proc.memory_mb >= 200 ? "text-amber-400" : "text-muted-foreground"
                      )}>
                        {formatMemory(proc.memory_mb)}
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-muted/60 rounded-full overflow-hidden">
                      <div
                        className={cn("h-full rounded-full transition-all duration-500", getMemoryColor(proc.memory_mb))}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Processos Anômalos */}
      {anomalies && anomalies.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <div className="flex items-center justify-center w-6 h-6 rounded-md bg-amber-500/15">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
            </div>
            <h4 className="text-sm font-semibold text-foreground">
              Processos Suspeitos
            </h4>
            <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4">
              {anomalies.length}
            </Badge>
          </div>
          <div className="space-y-1.5">
            {anomalies.map((item, idx) => (
              <div
                key={idx}
                className="flex items-start gap-2 rounded-lg px-3 py-2 bg-destructive/5 border border-destructive/10"
              >
                <AlertTriangle className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <span className="text-sm font-mono font-medium text-foreground block truncate">
                    {item.name}
                  </span>
                  {item.reason && (
                    <span className="text-xs text-muted-foreground truncate block">
                      {item.reason}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Auto-Reparo */}
      {autoRepairStats && (autoRepairStats.disk_cleanups > 0 || autoRepairStats.processes_killed > 0) && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <div className="flex items-center justify-center w-6 h-6 rounded-md bg-emerald-500/15">
              <Wrench className="h-3.5 w-3.5 text-emerald-500" />
            </div>
            <h4 className="text-sm font-semibold text-foreground">Auto-Reparo</h4>
          </div>
          <div className="space-y-2 px-3">
            {autoRepairStats.disk_cleanups > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-sm flex items-center gap-2 text-muted-foreground">
                  <HardDrive className="h-3.5 w-3.5" />
                  Limpezas de disco
                </span>
                <Badge variant="secondary">{autoRepairStats.disk_cleanups}</Badge>
              </div>
            )}
            {autoRepairStats.processes_killed > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-sm flex items-center gap-2 text-muted-foreground">
                  <Zap className="h-3.5 w-3.5" />
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
          </div>
        </section>
      )}

      {/* Empty state */}
      {(!processes || !processes.top_by_cpu?.length) && (!anomalies || !anomalies.length) && (
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
