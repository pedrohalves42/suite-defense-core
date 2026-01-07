/**
 * SimpleStatusIndicator - Indicador Visual Universal
 * 
 * Mostra status de forma clara e simples para qualquer usuário.
 * Usa animações sutis e cores semânticas.
 */

import { cn } from '@/lib/utils';
import { Loader2, CheckCircle, XCircle, Clock, AlertTriangle, Wifi, WifiOff, Pause } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export type StatusType = 
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'timeout'
  | 'offline'
  | 'online'
  | 'warning'
  | 'unknown';

interface StatusConfig {
  icon: typeof CheckCircle;
  label: string;
  description: string;
  colorClass: string;
  bgClass: string;
  animate?: boolean;
  pulseColor?: string;
}

const STATUS_CONFIG: Record<StatusType, StatusConfig> = {
  pending: {
    icon: Clock,
    label: 'Aguardando',
    description: 'Na fila, aguardando sua vez',
    colorClass: 'text-amber-500',
    bgClass: 'bg-amber-500/10',
    pulseColor: 'bg-amber-500',
  },
  running: {
    icon: Loader2,
    label: 'Trabalhando...',
    description: 'Em andamento agora',
    colorClass: 'text-blue-500',
    bgClass: 'bg-blue-500/10',
    animate: true,
    pulseColor: 'bg-blue-500',
  },
  completed: {
    icon: CheckCircle,
    label: 'Pronto!',
    description: 'Tudo certo, tarefa concluída',
    colorClass: 'text-green-500',
    bgClass: 'bg-green-500/10',
  },
  failed: {
    icon: XCircle,
    label: 'Não deu certo',
    description: 'Houve um problema',
    colorClass: 'text-red-500',
    bgClass: 'bg-red-500/10',
  },
  cancelled: {
    icon: Pause,
    label: 'Cancelado',
    description: 'Foi interrompido',
    colorClass: 'text-muted-foreground',
    bgClass: 'bg-muted/50',
  },
  timeout: {
    icon: Clock,
    label: 'Tempo esgotado',
    description: 'Demorou demais para responder',
    colorClass: 'text-muted-foreground',
    bgClass: 'bg-muted/50',
  },
  offline: {
    icon: WifiOff,
    label: 'Desconectado',
    description: 'Computador não está respondendo',
    colorClass: 'text-red-500',
    bgClass: 'bg-red-500/10',
  },
  online: {
    icon: Wifi,
    label: 'Conectado',
    description: 'Funcionando normalmente',
    colorClass: 'text-green-500',
    bgClass: 'bg-green-500/10',
  },
  warning: {
    icon: AlertTriangle,
    label: 'Atenção',
    description: 'Algo precisa de atenção',
    colorClass: 'text-amber-500',
    bgClass: 'bg-amber-500/10',
  },
  unknown: {
    icon: Clock,
    label: 'Desconhecido',
    description: 'Status não identificado',
    colorClass: 'text-muted-foreground',
    bgClass: 'bg-muted/50',
  },
};

interface SimpleStatusIndicatorProps {
  status: StatusType | string;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  showPulse?: boolean;
  className?: string;
}

export function SimpleStatusIndicator({
  status,
  size = 'md',
  showLabel = true,
  showPulse = true,
  className,
}: SimpleStatusIndicatorProps) {
  const config = STATUS_CONFIG[status as StatusType] || STATUS_CONFIG.unknown;
  const Icon = config.icon;
  
  const sizeClasses = {
    sm: { icon: 'h-3 w-3', text: 'text-xs', gap: 'gap-1', pulse: 'h-1.5 w-1.5' },
    md: { icon: 'h-4 w-4', text: 'text-sm', gap: 'gap-1.5', pulse: 'h-2 w-2' },
    lg: { icon: 'h-5 w-5', text: 'text-base', gap: 'gap-2', pulse: 'h-2.5 w-2.5' },
  };
  
  const sizes = sizeClasses[size];
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              'inline-flex items-center',
              sizes.gap,
              config.bgClass,
              'px-2 py-1 rounded-full',
              className
            )}
          >
            {showPulse && config.pulseColor && (
              <span className="relative flex">
                <span
                  className={cn(
                    sizes.pulse,
                    config.pulseColor,
                    'rounded-full opacity-75 animate-ping absolute'
                  )}
                />
                <span
                  className={cn(
                    sizes.pulse,
                    config.pulseColor,
                    'rounded-full'
                  )}
                />
              </span>
            )}
            <Icon
              className={cn(
                sizes.icon,
                config.colorClass,
                config.animate && 'animate-spin'
              )}
            />
            {showLabel && (
              <span className={cn(sizes.text, config.colorClass, 'font-medium')}>
                {config.label}
              </span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>{config.description}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Componente de indicador mínimo (apenas o ponto colorido)
interface StatusDotProps {
  status: StatusType | string;
  size?: 'sm' | 'md' | 'lg';
  pulse?: boolean;
  className?: string;
}

export function StatusDot({ status, size = 'md', pulse = false, className }: StatusDotProps) {
  const config = STATUS_CONFIG[status as StatusType] || STATUS_CONFIG.unknown;
  
  const dotSizes = {
    sm: 'h-2 w-2',
    md: 'h-2.5 w-2.5',
    lg: 'h-3 w-3',
  };
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cn('relative inline-flex', className)}>
            {pulse && (
              <span
                className={cn(
                  dotSizes[size],
                  config.pulseColor || config.bgClass,
                  'rounded-full opacity-75 animate-ping absolute'
                )}
              />
            )}
            <span
              className={cn(
                dotSizes[size],
                config.pulseColor || config.bgClass,
                'rounded-full'
              )}
            />
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p className="font-medium">{config.label}</p>
          <p className="text-xs text-muted-foreground">{config.description}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
