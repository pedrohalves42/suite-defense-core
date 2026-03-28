import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { CheckCircle, Clock, Cog, XCircle } from 'lucide-react';
import { getOsDisplayName, getOsIcon } from '@/lib/os-utils';
import { cn } from '@/lib/utils';
import type { AgentMetrics } from './types';
import { getAgentCardStyle, getHealthColor } from './utils';

interface AgentCardProps {
  agent: AgentMetrics;
  isProcessesSelected: boolean;
  onToggleProcesses: (agent: { id: string; name: string } | null) => void;
}

function ResourceBar({ label, value, threshold }: { label: string; value: number | null; threshold: number }) {
  const color = getHealthColor(value, threshold);
  const barColor = value !== null && value > threshold ? 'bg-destructive' : 
                   value !== null && value > threshold * 0.8 ? 'bg-warning' : 'bg-success';

  const getTooltipContent = () => {
    if (value === null) return <p className="text-xs">Sem dados</p>;
    if (value > threshold) {
      const labels: Record<string, { title: string; risk: string; action: string }> = {
        'Processador': { title: 'CPU em uso excessivo', risk: 'travamento ou lentidão severa', action: 'investigar processos consumindo CPU' },
        'Memória RAM': { title: 'Memória crítica', risk: 'sistema pode travar', action: 'encerrar aplicativos não essenciais' },
        'Armazenamento': { title: 'Disco quase cheio', risk: 'falha de escrita / travamento', action: 'limpeza ou expansão urgente' },
      };
      const info = labels[label] || { title: `${label} crítico`, risk: 'problema detectado', action: 'verificar' };
      return (
        <>
          <p className="font-medium text-red-500">{info.title}</p>
          <p className="text-xs">Risco: {info.risk}</p>
          <p className="text-xs text-muted-foreground">Ação: {info.action}</p>
        </>
      );
    }
    if (value > threshold * 0.8) {
      return (
        <>
          <p className="font-medium text-amber-500">{label} elevada</p>
          <p className="text-xs">Recomendado monitorar</p>
        </>
      );
    }
    return <p className="text-xs">Uso de {label.toLowerCase()} normal</p>;
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="cursor-help">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-muted-foreground">{label}</span>
              <span className={color}>
                {value !== null ? `${value.toFixed(0)}%` : 'N/A'}
              </span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div 
                className={cn("h-full transition-all", barColor)}
                style={{ width: `${value || 0}%` }}
              />
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          {getTooltipContent()}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function AgentCard({ agent, isProcessesSelected, onToggleProcesses }: AgentCardProps) {
  const cardStyle = getAgentCardStyle(agent);

  return (
    <Card className={cn(
      "transition-all duration-200 hover:shadow-lg",
      cardStyle.border,
      cardStyle.bg
    )}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{getOsIcon(agent.os_type)}</span>
            <div>
              <CardTitle className="text-base">{agent.name}</CardTitle>
              <p className="text-xs text-muted-foreground">{agent.hostname || 'N/A'}</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge variant={agent.is_online ? 'default' : 'secondary'} className={cn(
              agent.is_online ? "bg-success text-success-foreground" : ""
            )}>
              {agent.is_online ? (
                <><CheckCircle className="w-3 h-3 mr-1" /> Online</>
              ) : (
                <><XCircle className="w-3 h-3 mr-1" /> Offline</>
              )}
            </Badge>
            {cardStyle.label !== 'Normal' && cardStyle.label !== 'Offline' && (
              <Badge 
                variant="outline" 
                className={cn(
                  'text-xs',
                  cardStyle.label === 'Crítico' ? 'bg-red-500/10 text-red-500 border-red-500/20' : 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                )}
              >
                {cardStyle.label}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          <ResourceBar label="Processador" value={agent.cpu_usage} threshold={90} />
          <ResourceBar label="Memória RAM" value={agent.memory_usage} threshold={85} />
          <ResourceBar label="Armazenamento" value={agent.disk_usage} threshold={90} />
        </div>

        <div className="flex justify-between items-center pt-2 border-t text-xs text-muted-foreground">
          <span>{getOsDisplayName(agent.os_type, agent.os_version || null)}</span>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-5 px-1.5 text-[10px]"
              onClick={(e) => {
                e.stopPropagation();
                onToggleProcesses(
                  isProcessesSelected ? null : { id: agent.id, name: agent.name }
                );
              }}
            >
              <Cog className="h-3 w-3 mr-0.5" />
              Processos
            </Button>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {agent.uptime_hours !== null ? `${agent.uptime_hours}h ligado` : 'N/A'}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
