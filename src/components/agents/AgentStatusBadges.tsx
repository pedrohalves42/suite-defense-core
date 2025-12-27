import { Badge } from '@/components/ui/badge';
import { AlertTriangle, ShieldOff, Zap, Clock } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface AgentStatusBadgesProps {
  isThrottled?: boolean | null;
  isIsolated?: boolean | null;
  isInSafeMode?: boolean | null;
  throttleReason?: string | null;
  isolationReason?: string | null;
  safeModeReason?: string | null;
  compact?: boolean;
}

export function AgentStatusBadges({
  isThrottled,
  isIsolated,
  isInSafeMode,
  throttleReason,
  isolationReason,
  safeModeReason,
  compact = false,
}: AgentStatusBadgesProps) {
  const badges = [];

  if (isIsolated) {
    badges.push(
      <Tooltip key="isolated">
        <TooltipTrigger asChild>
          <Badge 
            variant="destructive" 
            className="gap-1 text-xs"
          >
            <ShieldOff className="h-3 w-3" />
            {!compact && 'Isolado'}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p className="font-medium">Agente Isolado</p>
          {isolationReason && <p className="text-xs text-muted-foreground">{isolationReason}</p>}
        </TooltipContent>
      </Tooltip>
    );
  }

  if (isThrottled) {
    badges.push(
      <Tooltip key="throttled">
        <TooltipTrigger asChild>
          <Badge 
            variant="outline" 
            className="gap-1 text-xs border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-400"
          >
            <Clock className="h-3 w-3" />
            {!compact && 'Velocidade Limitada'}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p className="font-medium">Comunicação reduzida temporariamente</p>
          <p className="text-xs text-muted-foreground">
            {throttleReason || 'O computador está enviando menos dados para proteger o sistema'}
          </p>
        </TooltipContent>
      </Tooltip>
    );
  }

  if (isInSafeMode) {
    badges.push(
      <Tooltip key="safemode">
        <TooltipTrigger asChild>
          <Badge 
            variant="outline" 
            className="gap-1 text-xs border-orange-500 bg-orange-500/10 text-orange-700 dark:text-orange-400"
          >
            <AlertTriangle className="h-3 w-3" />
            {!compact && 'Modo Protegido'}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p className="font-medium">Proteção ativada automaticamente</p>
          <p className="text-xs text-muted-foreground">
            {safeModeReason || 'O computador detectou problemas e entrou em modo de segurança'}
          </p>
        </TooltipContent>
      </Tooltip>
    );
  }

  if (badges.length === 0) return null;

  return <div className="flex items-center gap-1 flex-wrap">{badges}</div>;
}
