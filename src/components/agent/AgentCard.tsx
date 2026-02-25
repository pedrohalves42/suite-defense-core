import { Monitor, Cpu, MemoryStick, HardDrive, Clock, Activity, Shield, ShieldAlert, Zap, Wifi, WifiOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { AgentMetricsBar } from './AgentMetricsBar';
import { formatDistanceToNow, ptBR } from '@/lib/date-utils';

export interface DiskMetric {
  drive_letter: string;
  usage_percent: number;
  total_gb?: number;
  free_gb?: number;
  is_system_drive?: boolean;
}

export interface AgentCardProps {
  id: string;
  name: string;
  hostname?: string;
  osType?: string;
  osVersion?: string;
  agentVersion?: string;
  isOnline: boolean;
  healthStatus?: 'healthy' | 'warning' | 'critical';
  lastHeartbeat?: string | Date;
  uptimeSeconds?: number;
  cpuPercent?: number | null;
  memoryPercent?: number | null;
  diskPercent?: number | null;
  disks?: DiskMetric[];
  isThrottled?: boolean;
  isIsolated?: boolean;
  isInSafeMode?: boolean;
  onClick?: () => void;
  selected?: boolean;
  compact?: boolean;
}

function formatUptime(seconds: number | undefined): string {
  if (!seconds) return '';
  const hours = Math.floor(seconds / 3600);
  if (hours < 24) return `${hours}h ligado`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h ligado`;
}

function formatLastSeen(date: string | Date | undefined): string {
  if (!date) return '';
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    return formatDistanceToNow(d, { addSuffix: true, locale: ptBR });
  } catch {
    return '';
  }
}

function getOfflineDuration(date: string | Date | undefined): string {
  if (!date) return 'Sem conexão';
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    return `Offline ${formatDistanceToNow(d, { locale: ptBR })}`;
  } catch {
    return 'Offline';
  }
}

function getBorderAndBgClass(isOnline: boolean, healthStatus?: 'healthy' | 'warning' | 'critical') {
  if (!isOnline) return 'border-l-4 border-l-muted-foreground/40 opacity-60';
  if (healthStatus === 'critical') return 'border-l-4 border-l-red-500 bg-red-500/[0.03]';
  if (healthStatus === 'warning') return 'border-l-4 border-l-amber-500 bg-amber-500/[0.03]';
  return 'border-l-4 border-l-emerald-500';
}

export function AgentCard({
  name,
  hostname,
  osVersion,
  agentVersion,
  isOnline,
  healthStatus,
  lastHeartbeat,
  uptimeSeconds,
  cpuPercent,
  memoryPercent,
  diskPercent,
  disks,
  isThrottled,
  isIsolated,
  isInSafeMode,
  onClick,
  selected,
  compact = false,
}: AgentCardProps) {
  const hasSystemMetrics = cpuPercent !== undefined || memoryPercent !== undefined || diskPercent !== undefined;
  const hasDisks = disks && disks.length > 0;

  return (
    <Card
      className={cn(
        "bg-card border border-border/50 overflow-hidden transition-all duration-200",
        getBorderAndBgClass(isOnline, healthStatus),
        onClick && "cursor-pointer hover:bg-accent/5 hover:border-border",
        selected && "ring-2 ring-primary bg-accent/10"
      )}
      onClick={onClick}
    >
      <CardContent className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className={cn(
              "flex-shrink-0 p-2 rounded-lg",
              isOnline ? "bg-emerald-500/10" : "bg-muted/50"
            )}>
              <Monitor className={cn(
                "h-4 w-4",
                isOnline ? "text-emerald-400" : "text-muted-foreground"
              )} />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-foreground truncate">{name}</h3>
              {hostname && hostname !== name && (
                <p className="text-xs text-muted-foreground truncate">{hostname}</p>
              )}
            </div>
          </div>
          
          {/* Status badge claro */}
          <div className="flex-shrink-0">
            {isOnline ? (
              healthStatus === 'critical' ? (
                <Badge className="bg-red-500/15 text-red-400 border-red-500/30 text-[10px] px-2 py-0.5 h-5 gap-1">
                  <ShieldAlert className="h-3 w-3" />
                  Crítico
                </Badge>
              ) : healthStatus === 'warning' ? (
                <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 text-[10px] px-2 py-0.5 h-5 gap-1">
                  <Shield className="h-3 w-3" />
                  Atenção
                </Badge>
              ) : (
                <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px] px-2 py-0.5 h-5 gap-1">
                  <Wifi className="h-3 w-3" />
                  Online
                </Badge>
              )
            ) : (
              <Badge variant="outline" className="bg-muted/30 text-muted-foreground border-muted-foreground/30 text-[10px] px-2 py-0.5 h-5 gap-1">
                <WifiOff className="h-3 w-3" />
                Offline
              </Badge>
            )}
          </div>
        </div>

        {/* Offline duration banner */}
        {!isOnline && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 rounded-md px-3 py-1.5">
            <Clock className="h-3.5 w-3.5" />
            <span>{getOfflineDuration(lastHeartbeat)}</span>
          </div>
        )}

        {/* Estados especiais */}
        {(isThrottled || isIsolated || isInSafeMode) && (
          <div className="flex flex-wrap gap-1.5">
            {isInSafeMode && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 gap-1 border-orange-500/50 text-orange-400">
                <Shield className="h-3 w-3" />
                Safe Mode
              </Badge>
            )}
            {isIsolated && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 gap-1 border-red-500/50 text-red-400">
                <ShieldAlert className="h-3 w-3" />
                Isolado
              </Badge>
            )}
            {isThrottled && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 gap-1 border-amber-500/50 text-amber-400">
                <Zap className="h-3 w-3" />
                Throttled
              </Badge>
            )}
          </div>
        )}

        {/* Métricas do Sistema - só mostra se online */}
        {isOnline && hasSystemMetrics && !compact && (
          <div className="space-y-2 pt-1">
            {cpuPercent !== undefined && cpuPercent !== null && (
              <AgentMetricsBar label="Processador" icon={Cpu} value={cpuPercent} size="sm" />
            )}
            {memoryPercent !== undefined && memoryPercent !== null && (
              <AgentMetricsBar label="Memória RAM" icon={MemoryStick} value={memoryPercent} size="sm" />
            )}
            {diskPercent !== undefined && diskPercent !== null && !hasDisks && (
              <AgentMetricsBar label="Armazenamento" icon={HardDrive} value={diskPercent} size="sm" thresholds={{ warning: 70, danger: 90 }} />
            )}
          </div>
        )}

        {/* Discos Detalhados - só mostra se online */}
        {isOnline && hasDisks && !compact && (
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <HardDrive className="h-3 w-3" />
              <span>Armazenamento</span>
            </div>
            {disks.slice(0, 4).map((disk) => (
              <div key={disk.drive_letter} className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-5 font-medium">{disk.drive_letter}:</span>
                <div className="flex-1">
                  <AgentMetricsBar label="" value={disk.usage_percent} size="sm" showLabel={false} thresholds={{ warning: 70, danger: 90 }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-border/30">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {osVersion && <span className="truncate max-w-[120px]">{osVersion}</span>}
            {osVersion && agentVersion && <span>•</span>}
            {agentVersion && <span className="font-mono">{agentVersion}</span>}
          </div>
          
          {isOnline && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {uptimeSeconds !== undefined && uptimeSeconds > 0 && (
                <>
                  <Clock className="h-3 w-3" />
                  <span>{formatUptime(uptimeSeconds)}</span>
                </>
              )}
              {lastHeartbeat && (
                <>
                  {uptimeSeconds !== undefined && uptimeSeconds > 0 && <span>•</span>}
                  <Activity className="h-3 w-3" />
                  <span>{formatLastSeen(lastHeartbeat)}</span>
                </>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
