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
    <div className={cn('grid grid-cols-2 md:grid-cols-4 gap-6', className)}>
      {stats.map((stat) => {
        const Icon = stat.icon;
        
        const content = (
          <div className={cn(
            'group relative rounded-2xl border bg-card p-5 transition-all duration-500 ease-premium overflow-hidden',
            stat.isUrgent ? 'border-destructive/20 shadow-sm' : 'border-border/40 shadow-premium',
            stat.link && 'hover:-translate-y-1 hover:shadow-elevated cursor-pointer hover:border-primary/20'
          )}>
            <div className={cn(
              "absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700",
              stat.bgColor.replace('bg-', 'bg-gradient-to-br from-')
            )} />
            
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-4">
                <div className={cn("p-2.5 rounded-xl transition-transform duration-500 group-hover:scale-110", stat.bgColor)}>
                  <Icon className={cn('h-5 w-5', stat.color)} />
                </div>
                <span className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground">{stat.label}</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className={cn('text-3xl font-bold tracking-tight', stat.color)}>{stat.value}</span>
                {stat.subValue && (
                  <span className={cn('text-sm font-semibold opacity-70', stat.color)}>{stat.subValue}</span>
                )}
              </div>
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
