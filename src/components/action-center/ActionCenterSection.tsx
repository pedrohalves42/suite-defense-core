import { ReactNode, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, AlertCircle, Info, Monitor, Clock, ArchiveX } from 'lucide-react';
import { ActionItem } from '@/hooks/useActionCenter';
import { useSuppressedAlertsByArchive } from '@/hooks/useSuppressedAlerts';

type SectionType = 'urgent' | 'recommended' | 'informational';

interface ActionCenterSectionProps {
  type: SectionType;
  count: number;
  children: ReactNode;
  className?: string;
  items?: ActionItem[];
}

const SECTION_CONFIG: Record<SectionType, {
  title: string;
  icon: typeof AlertTriangle;
  iconClassName: string;
  badgeClassName: string;
  emoji: string;
}> = {
  urgent: {
    title: 'Ações Urgentes',
    icon: AlertTriangle,
    iconClassName: 'text-red-500',
    badgeClassName: 'bg-red-500 text-white',
    emoji: '🔴',
  },
  recommended: {
    title: 'Ações Recomendadas',
    icon: AlertCircle,
    iconClassName: 'text-yellow-500',
    badgeClassName: 'bg-yellow-500 text-white',
    emoji: '🟡',
  },
  informational: {
    title: 'Informativo',
    icon: Info,
    iconClassName: 'text-blue-500',
    badgeClassName: 'bg-blue-500 text-white',
    emoji: '🔵',
  },
};

// Calculate summary stats from items
function useSectionSummary(items?: ActionItem[]) {
  return useMemo(() => {
    if (!items || items.length === 0) {
      return null;
    }

    // Group by trigger type
    const byType = items.reduce((acc, item) => {
      const type = item.trigger_type || 'other';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Get unique machines
    const machines = new Set(items.map(i => i.agent_name || i.hostname).filter(Boolean));

    // Calculate average pending time
    const now = Date.now();
    const totalMs = items.reduce((sum, item) => {
      const created = new Date(item.created_at).getTime();
      return sum + (now - created);
    }, 0);
    const avgMinutes = Math.round(totalMs / items.length / (1000 * 60));

    // Format average time
    let avgTimeDisplay = '';
    if (avgMinutes < 60) {
      avgTimeDisplay = `${avgMinutes} min`;
    } else if (avgMinutes < 1440) {
      const hours = Math.floor(avgMinutes / 60);
      const mins = avgMinutes % 60;
      avgTimeDisplay = mins > 0 ? `${hours}h ${mins}min` : `${hours}h`;
    } else {
      const days = Math.floor(avgMinutes / 1440);
      avgTimeDisplay = `${days} ${days === 1 ? 'dia' : 'dias'}`;
    }

    // Format type breakdown
    const typeLabels: Record<string, string> = {
      agent_offline: 'offline',
      anomaly_detection: 'anomalia',
      high_cpu_usage: 'CPU alta',
      high_memory_usage: 'memória alta',
      high_disk_usage: 'disco cheio',
      vulnerability_critical: 'vulnerabilidade',
      suspicious_process: 'processo suspeito',
      multiple_malicious_access: 'acesso malicioso',
      antivirus_disabled: 'antivírus desativado',
      safe_mode_detected: 'modo seguro',
    };

    const typeBreakdown = Object.entries(byType)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([type, count]) => `${count} ${typeLabels[type] || type}`)
      .join(' • ');

    return {
      typeBreakdown,
      machineCount: machines.size,
      machines: Array.from(machines).slice(0, 3),
      avgTime: avgTimeDisplay,
    };
  }, [items]);
}

export function ActionCenterSection({ type, count, children, className, items }: ActionCenterSectionProps) {
  const config = SECTION_CONFIG[type];
  const Icon = config.icon;
  const summary = useSectionSummary(items);
  const { data: suppressedCount } = useSuppressedAlertsByArchive();

  if (count === 0) return null;

  return (
    <section className={cn('space-y-3', className)}>
      <div className="space-y-2">
        {/* Header */}
        <div className="flex items-center gap-2">
          <span className="text-lg">{config.emoji}</span>
          <Icon className={cn('h-5 w-5', config.iconClassName)} />
          <h2 className="text-lg font-semibold">{config.title}</h2>
          <Badge className={config.badgeClassName}>{count}</Badge>
          
          {/* Suppressed alerts indicator - only show on urgent section */}
          {type === 'urgent' && suppressedCount && suppressedCount > 0 && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground ml-2">
              <ArchiveX className="h-3.5 w-3.5" />
              {suppressedCount} suprimidos por arquivamento
            </span>
          )}
        </div>

        {/* Summary line */}
        {summary && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground pl-8">
            {summary.typeBreakdown && (
              <span className="flex items-center gap-1">
                <AlertCircle className="h-3.5 w-3.5" />
                {summary.typeBreakdown}
              </span>
            )}
            {summary.machineCount > 0 && (
              <span className="flex items-center gap-1">
                <Monitor className="h-3.5 w-3.5" />
                {summary.machineCount === 1 
                  ? summary.machines[0]
                  : `${summary.machineCount} máquinas afetadas`
                }
              </span>
            )}
            {summary.avgTime && (
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                Tempo médio pendente: {summary.avgTime}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="space-y-3">
        {children}
      </div>
    </section>
  );
}
