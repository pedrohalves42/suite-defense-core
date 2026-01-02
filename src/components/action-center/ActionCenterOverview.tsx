import { cn } from '@/lib/utils';
import { AlertTriangle, CheckCircle2, WifiOff, Lightbulb, TrendingUp, TrendingDown, Minus, Percent } from 'lucide-react';
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
      color: urgentCount > 0 ? 'text-red-500' : 'text-muted-foreground',
      bgColor: urgentCount > 0 ? 'bg-red-500/10' : 'bg-muted/50',
      borderColor: urgentCount > 0 ? 'border-red-500/20' : 'border-border',
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
      color: recommendedCount > 0 ? 'text-amber-500' : 'text-muted-foreground',
      bgColor: recommendedCount > 0 ? 'bg-amber-500/10' : 'bg-muted/50',
      borderColor: recommendedCount > 0 ? 'border-amber-500/20' : 'border-border',
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
      color: healthPercent >= 80 
        ? 'text-green-500' 
        : healthPercent >= 50 
          ? 'text-yellow-500'
          : 'text-red-500',
      bgColor: healthPercent >= 80 
        ? 'bg-green-500/10' 
        : healthPercent >= 50 
          ? 'bg-yellow-500/10'
          : 'bg-red-500/10',
      borderColor: healthPercent >= 80 
        ? 'border-green-500/20' 
        : healthPercent >= 50 
          ? 'border-yellow-500/20'
          : 'border-red-500/20',
      link: '/admin/agent-health',
      tooltip: `${healthyCount} de ${totalAgents} agentes estão funcionando normalmente`,
    },
    {
      label: 'Offline',
      value: offlineCount,
      subValue: totalAgents > 0 && offlineCount > 0 ? `${offlinePercent}%` : null,
      icon: WifiOff,
      color: offlineCount > 0 ? 'text-orange-500' : 'text-muted-foreground',
      bgColor: offlineCount > 0 ? 'bg-orange-500/10' : 'bg-muted/50',
      borderColor: offlineCount > 0 ? 'border-orange-500/20' : 'border-border',
      link: offlineCount > 0 ? '/admin/agent-health?status=offline' : '/admin/agent-health',
      trend: offlineTrend,
      tooltip: offlineCount > 0 
        ? `${offlineCount} agentes não estão respondendo` 
        : 'Todos os agentes estão online',
    },
  ];

  return (
    <div className={cn('grid grid-cols-2 md:grid-cols-4 gap-4', className)}>
      {stats.map((stat) => {
        const Icon = stat.icon;
        const TrendIcon = stat.trend?.icon;
        
        const content = (
          <div
            className={cn(
              'rounded-xl border p-4 transition-all',
              stat.bgColor,
              stat.borderColor,
              stat.link && 'hover:scale-[1.02] cursor-pointer'
            )}
          >
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
