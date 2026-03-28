import { CheckCircle2, AlertTriangle, XCircle, HelpCircle, Loader2 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatBrazilDateTime } from '@/lib/date-utils';

type EffectivenessStatus = 'pending' | 'resolved' | 'partial' | 'failed' | 'unknown';

interface EffectivenessEvidence {
  before?: any;
  after?: any;
  comparison?: any;
  verdict?: string;
  note?: string;
}

interface Props {
  status: EffectivenessStatus;
  checkedAt?: string | null;
  evidence?: EffectivenessEvidence | null;
  compact?: boolean;
}

const STATUS_CONFIG: Record<EffectivenessStatus, {
  icon: typeof CheckCircle2;
  color: string;
  bgColor: string;
  label: string;
  description: string;
}> = {
  pending: { 
    icon: Loader2, 
    color: 'text-muted-foreground', 
    bgColor: 'bg-muted/50',
    label: 'Verificando...', 
    description: 'Aguardando verificação automática (até 15 min)'
  },
  resolved: { 
    icon: CheckCircle2, 
    color: 'text-green-600', 
    bgColor: 'bg-green-500/10',
    label: 'Resolvido', 
    description: 'Problema confirmado como resolvido'
  },
  partial: { 
    icon: AlertTriangle, 
    color: 'text-amber-600', 
    bgColor: 'bg-amber-500/10',
    label: 'Parcial', 
    description: 'Problema parcialmente resolvido'
  },
  failed: { 
    icon: XCircle, 
    color: 'text-red-600', 
    bgColor: 'bg-red-500/10',
    label: 'Não resolvido', 
    description: 'Ação não corrigiu o problema'
  },
  unknown: { 
    icon: HelpCircle, 
    color: 'text-muted-foreground', 
    bgColor: 'bg-muted/30',
    label: 'Sem verificação', 
    description: 'Verificação automática não disponível'
  },
};

export function EffectivenessBadge({ status, checkedAt, evidence, compact = false }: Props) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.unknown;
  const Icon = config.icon;

  const tooltipContent = (
    <div className="space-y-2 max-w-xs">
      <p className="font-medium">{config.description}</p>
      {evidence?.verdict && (
        <p className="text-sm">Veredicto: {evidence.verdict}</p>
      )}
      {evidence?.note && (
        <p className="text-sm text-muted-foreground">{evidence.note}</p>
      )}
      {checkedAt && (
        <p className="text-xs text-muted-foreground">
          Verificado em: {formatBrazilDateTime(checkedAt)}
        </p>
      )}
    </div>
  );

  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span data-testid="effectiveness-compact">
              <Icon className={cn(
                'h-4 w-4',
                config.color,
                status === 'pending' && 'animate-spin'
              )} />
            </span>
          </TooltipTrigger>
          <TooltipContent data-testid="effectiveness-tooltip">{tooltipContent}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge 
            variant="outline" 
            data-testid={`effectiveness-${status}`}
            className={cn(
              'gap-1 cursor-help',
              config.bgColor,
              config.color
            )}
          >
            <Icon className={cn(
              'h-3 w-3',
              status === 'pending' && 'animate-spin'
            )} />
            {config.label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent data-testid="effectiveness-tooltip">{tooltipContent}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
