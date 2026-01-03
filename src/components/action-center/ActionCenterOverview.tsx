import { cn } from '@/lib/utils';
import { AlertTriangle, CheckCircle2, WifiOff, Lightbulb, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface ActionCenterOverviewProps {
  urgentCount: number;
  recommendedCount: number;
  healthyCount: number;
  offlineCount: number;
  totalAgents: number;
  className?: string;
  previousUrgentCount?: number;
  previousOfflineCount?: number;
}

// Calculate trend indicator
function getTrend(current: number, previous?: number): { icon: typeof TrendingUp; label: string; className: string } | null {
  if (previous === undefined) return null;
  
  const diff = current - previous;
  if (diff > 0) {
    return { 
      icon: TrendingUp, 
      label: `+${diff} vs período anterior`,
      className: 'text-red-500' 
    };
  } else if (diff < 0) {
    return { 
      icon: TrendingDown, 
      label: `${diff} vs período anterior`,
      className: 'text-green-500' 
    };
  }
  return { 
    icon: Minus, 
    label: 'Sem mudança',
    className: 'text-muted-foreground' 
  };
}

export function ActionCenterOverview({
  urgentCount,
  recommendedCount,
  healthyCount,
  offlineCount,
  totalAgents,
  className,
  previousUrgentCount,
  previousOfflineCount,
}: ActionCenterOverviewProps) {
  // Calculate health percentage
  const healthPercent = totalAgents > 0 ? Math.round((healthyCount / totalAgents) * 100) : 0;
  const offlinePercent = totalAgents > 0 ? Math.round((offlineCount / totalAgents) * 100) : 0;

  // Get trends
  const urgentTrend = getTrend(urgentCount, previousUrgentCount);
  const offlineTrend = getTrend(offlineCount, previousOfflineCount);

  const stats = [
    {
      label: 'Ações Urgentes',
      value: urgentCount,
      icon: AlertTriangle,
      // HIERARCHICAL: Critical = vibrant red with pulse, Zero = neutral gray
      color: urgentCount > 0 ? 'text-red-500' : 'text-muted-foreground',
      bgColor: urgentCount > 0 ? 'bg-red-500/15' : 'bg-muted/30',
      borderColor: urgentCount > 0 ? 'border-red-500/40' : 'border-border/50',
      ringColor: urgentCount > 0 ? 'ring-red-500/20' : '',
      isUrgent: urgentCount > 0,
      link: null as string | null,
      trend: urgentTrend,
      tooltip: urgentCount > 0 
        ? 'Ações que requerem atenção imediata' 
        : 'Nenhuma ação urgente pendente',
    },
    {
      label: 'Recomendadas',
      value: recommendedCount,
      icon: Lightbulb,
      // Medium = soft yellow
      color: recommendedCount > 0 ? 'text-amber-500' : 'text-muted-foreground',
      bgColor: recommendedCount > 0 ? 'bg-amber-500/10' : 'bg-muted/30',
      borderColor: recommendedCount > 0 ? 'border-amber-500/30' : 'border-border/50',
      ringColor: '',
      isUrgent: false,
      link: null as string | null,
      tooltip: recommendedCount > 0 
        ? 'Ações recomendadas para melhorar segurança' 
        : 'Nenhuma recomendação pendente',
    },
    {
      label: 'Protegidos',
      value: healthyCount,
      subValue: totalAgents > 0 ? `${healthPercent}%` : null,
      icon: CheckCircle2,
      // Healthy = neutral gray/blue (not vibrant green, to reduce visual competition)
      color: healthPercent >= 80 
        ? 'text-emerald-600' 
        : healthPercent >= 50 
          ? 'text-amber-500'
          : 'text-red-500',
      bgColor: 'bg-muted/30',
      borderColor: 'border-border/50',
      ringColor: '',
      isUrgent: false,
      link: '/admin/agent-health',
      tooltip: `${healthyCount} de ${totalAgents} agentes estão funcionando normalmente`,
    },
    {
      label: 'Offline',
      value: offlineCount,
      subValue: totalAgents > 0 && offlineCount > 0 ? `${offlinePercent}%` : null,
      icon: WifiOff,
      color: offlineCount > 0 ? 'text-orange-500' : 'text-muted-foreground',
      bgColor: offlineCount > 0 ? 'bg-orange-500/10' : 'bg-muted/30',
      borderColor: offlineCount > 0 ? 'border-orange-500/30' : 'border-border/50',
      ringColor: '',
      isUrgent: false,
      link: offlineCount > 0 ? '/admin/agent-health?status=offline' : '/admin/agent-health',
      trend: offlineTrend,
      tooltip: offlineCount > 0 
        ? `${offlineCount} agentes não estão respondendo` 
        : 'Todos os agentes estão online',
    },
  ];

  return (
    <div className={cn('grid grid-cols-2 md:grid-cols-4 gap-4', className)}>
      {stats.map((stat, index) => {
        const Icon = stat.icon;
        const TrendIcon = stat.trend?.icon;
        
        const content = (
          <div
            className={cn(
              'relative rounded-xl border p-4 transition-all',
              stat.bgColor,
              stat.borderColor,
              stat.isUrgent && 'ring-2 ring-red-500/20 shadow-lg shadow-red-500/10',
              // First card (urgent) is visually larger when has items
              index === 0 && stat.value > 0 && 'md:col-span-1',
              stat.link && 'hover:scale-[1.02] cursor-pointer'
            )}
          >
            {/* Subtle pulse for urgent */}
            {stat.isUrgent && (
              <div className="absolute inset-0 rounded-xl bg-red-500/5 animate-pulse pointer-events-none" />
            )}
            
            <div className="relative">
              <div className="flex items-start justify-between mb-1">
                <div className={cn('p-2 rounded-lg', stat.bgColor)}>
                  <Icon className={cn('h-5 w-5', stat.color)} />
                </div>
                {stat.trend && TrendIcon && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <TrendIcon className={cn('h-4 w-4', stat.trend.className)} />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{stat.trend.label}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
              <div className="flex items-baseline gap-1.5 mt-2">
                <p className={cn('text-2xl font-bold', stat.color)}>{stat.value}</p>
                {stat.subValue && (
                  <span className={cn('text-sm font-medium flex items-center gap-0.5', stat.color)}>
                    ({stat.subValue})
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
            </div>
          </div>
        );

        const wrappedContent = (
          <TooltipProvider key={stat.label}>
            <Tooltip>
              <TooltipTrigger asChild>
                {stat.link ? (
                  <Link to={stat.link}>{content}</Link>
                ) : (
                  <div>{content}</div>
                )}
              </TooltipTrigger>
              <TooltipContent>
                <p>{stat.tooltip}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );

        return wrappedContent;
      })}
    </div>
  );
}
