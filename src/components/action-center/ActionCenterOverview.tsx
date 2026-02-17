import { cn } from '@/lib/utils';
import { AlertTriangle, CheckCircle2, WifiOff, Lightbulb } from 'lucide-react';
import { Link } from 'react-router-dom';

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

export function ActionCenterOverview({
  urgentCount,
  recommendedCount,
  healthyCount,
  offlineCount,
  totalAgents,
  className,
}: ActionCenterOverviewProps) {
  const healthPercent = totalAgents > 0 ? Math.round((healthyCount / totalAgents) * 100) : 0;

  const stats = [
    {
      label: 'Urgentes',
      value: urgentCount,
      icon: AlertTriangle,
      color: urgentCount > 0 ? 'text-red-500' : 'text-muted-foreground',
      bgColor: urgentCount > 0 ? 'bg-red-500/10' : 'bg-muted/30',
      isUrgent: urgentCount > 0,
      link: null as string | null,
    },
    {
      label: 'Recomendadas',
      value: recommendedCount,
      icon: Lightbulb,
      color: recommendedCount > 0 ? 'text-amber-500' : 'text-muted-foreground',
      bgColor: recommendedCount > 0 ? 'bg-amber-500/10' : 'bg-muted/30',
      isUrgent: false,
      link: null as string | null,
    },
    {
      label: 'Protegidos',
      value: healthyCount,
      subValue: totalAgents > 0 ? `${healthPercent}%` : null,
      icon: CheckCircle2,
      color: healthPercent >= 80 ? 'text-emerald-600' : healthPercent >= 50 ? 'text-amber-500' : 'text-red-500',
      bgColor: 'bg-muted/30',
      isUrgent: false,
      link: '/admin/agent-health',
    },
    {
      label: 'Offline',
      value: offlineCount,
      icon: WifiOff,
      color: offlineCount > 0 ? 'text-orange-500' : 'text-muted-foreground',
      bgColor: offlineCount > 0 ? 'bg-orange-500/10' : 'bg-muted/30',
      isUrgent: false,
      link: offlineCount > 0 ? '/admin/agent-health?status=offline' : '/admin/agent-health',
    },
  ];

  return (
    <div className={cn('grid grid-cols-2 md:grid-cols-4 gap-3', className)}>
      {stats.map((stat) => {
        const Icon = stat.icon;
        
        const content = (
          <div className={cn(
            'rounded-lg border p-3 transition-all',
            stat.bgColor,
            stat.isUrgent && 'ring-1 ring-red-500/20',
            stat.link && 'hover:scale-[1.02] cursor-pointer'
          )}>
            <div className="flex items-center gap-2 mb-1">
              <Icon className={cn('h-4 w-4', stat.color)} />
              <span className="text-xs text-muted-foreground">{stat.label}</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className={cn('text-xl font-bold', stat.color)}>{stat.value}</span>
              {stat.subValue && (
                <span className={cn('text-xs', stat.color)}>({stat.subValue})</span>
              )}
            </div>
          </div>
        );

        return stat.link ? (
          <Link key={stat.label} to={stat.link}>{content}</Link>
        ) : (
          <div key={stat.label}>{content}</div>
        );
      })}
    </div>
  );
}
