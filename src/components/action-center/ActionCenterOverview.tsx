import { AlertTriangle, CheckCircle2, Lightbulb, WifiOff, Monitor } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';

interface ActionCenterOverviewProps {
  urgentCount: number;
  recommendedCount: number;
  healthyCount: number;
  offlineCount: number;
  totalAgents: number;
  className?: string;
}

export function ActionCenterOverview({
  urgentCount,
  recommendedCount,
  healthyCount,
  offlineCount,
  totalAgents,
  className,
}: ActionCenterOverviewProps) {
  const stats = [
    {
      label: 'Ações Urgentes',
      value: urgentCount,
      icon: AlertTriangle,
      color: urgentCount > 0 ? 'text-red-500' : 'text-muted-foreground',
      bgColor: urgentCount > 0 ? 'bg-red-500/10' : 'bg-muted/50',
      borderColor: urgentCount > 0 ? 'border-red-500/20' : 'border-border',
      link: null,
    },
    {
      label: 'Recomendadas',
      value: recommendedCount,
      icon: Lightbulb,
      color: recommendedCount > 0 ? 'text-amber-500' : 'text-muted-foreground',
      bgColor: recommendedCount > 0 ? 'bg-amber-500/10' : 'bg-muted/50',
      borderColor: recommendedCount > 0 ? 'border-amber-500/20' : 'border-border',
      link: null,
    },
    {
      label: 'Protegidos',
      value: healthyCount,
      icon: CheckCircle2,
      color: healthyCount > 0 ? 'text-green-500' : 'text-muted-foreground',
      bgColor: healthyCount > 0 ? 'bg-green-500/10' : 'bg-muted/50',
      borderColor: healthyCount > 0 ? 'border-green-500/20' : 'border-border',
      link: '/admin/agent-health',
    },
    {
      label: 'Offline',
      value: offlineCount,
      icon: WifiOff,
      color: offlineCount > 0 ? 'text-orange-500' : 'text-muted-foreground',
      bgColor: offlineCount > 0 ? 'bg-orange-500/10' : 'bg-muted/50',
      borderColor: offlineCount > 0 ? 'border-orange-500/20' : 'border-border',
      link: '/admin/agent-health',
    },
  ];

  return (
    <div className={cn('grid grid-cols-2 md:grid-cols-4 gap-4', className)}>
      {stats.map((stat) => {
        const Icon = stat.icon;
        const content = (
          <div
            className={cn(
              'rounded-xl border p-4 transition-all',
              stat.bgColor,
              stat.borderColor,
              stat.link && 'hover:scale-[1.02] cursor-pointer'
            )}
          >
            <div className="flex items-center gap-3">
              <div className={cn('p-2 rounded-lg', stat.bgColor)}>
                <Icon className={cn('h-5 w-5', stat.color)} />
              </div>
              <div>
                <p className={cn('text-2xl font-bold', stat.color)}>{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </div>
          </div>
        );

        if (stat.link) {
          return (
            <Link key={stat.label} to={stat.link}>
              {content}
            </Link>
          );
        }

        return <div key={stat.label}>{content}</div>;
      })}
    </div>
  );
}
