import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { AlertTriangle, Lightbulb, Info, Monitor, Wifi, WifiOff } from 'lucide-react';

export type FilterType = 'all' | 'critical' | 'medium' | 'informational' | 'online' | 'offline';

interface AlertFilterChipsProps {
  activeFilters: FilterType[];
  onFilterChange: (filter: FilterType) => void;
  counts: {
    critical: number;
    medium: number;
    informational: number;
    online?: number;
    offline?: number;
  };
  className?: string;
}

const FILTER_CONFIG: Record<FilterType, {
  label: string;
  icon: typeof AlertTriangle;
  activeClass: string;
  inactiveClass: string;
}> = {
  all: {
    label: 'Todos',
    icon: Monitor,
    activeClass: 'bg-primary text-primary-foreground',
    inactiveClass: 'bg-muted/50 hover:bg-muted text-muted-foreground',
  },
  critical: {
    label: 'Críticos',
    icon: AlertTriangle,
    activeClass: 'bg-red-500 text-white hover:bg-red-600',
    inactiveClass: 'bg-red-500/10 text-red-600 hover:bg-red-500/20 border-red-500/20',
  },
  medium: {
    label: 'Médios',
    icon: Lightbulb,
    activeClass: 'bg-amber-500 text-white hover:bg-amber-600',
    inactiveClass: 'bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 border-amber-500/20',
  },
  informational: {
    label: 'Informativos',
    icon: Info,
    activeClass: 'bg-blue-500 text-white hover:bg-blue-600',
    inactiveClass: 'bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 border-blue-500/20',
  },
  online: {
    label: 'Online',
    icon: Wifi,
    activeClass: 'bg-green-500 text-white hover:bg-green-600',
    inactiveClass: 'bg-green-500/10 text-green-600 hover:bg-green-500/20 border-green-500/20',
  },
  offline: {
    label: 'Offline',
    icon: WifiOff,
    activeClass: 'bg-gray-500 text-white hover:bg-gray-600',
    inactiveClass: 'bg-gray-500/10 text-gray-600 hover:bg-gray-500/20 border-gray-500/20',
  },
};

export function AlertFilterChips({
  activeFilters,
  onFilterChange,
  counts,
  className,
}: AlertFilterChipsProps) {
  const filters: FilterType[] = ['critical', 'medium', 'informational'];
  
  // Add online/offline if counts are provided
  if (counts.online !== undefined || counts.offline !== undefined) {
    filters.push('online', 'offline');
  }

  const isActive = (filter: FilterType) => activeFilters.includes(filter);

  const getCount = (filter: FilterType): number => {
    switch (filter) {
      case 'critical':
        return counts.critical;
      case 'medium':
        return counts.medium;
      case 'informational':
        return counts.informational;
      case 'online':
        return counts.online || 0;
      case 'offline':
        return counts.offline || 0;
      default:
        return 0;
    }
  };

  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {filters.map((filter) => {
        const config = FILTER_CONFIG[filter];
        const Icon = config.icon;
        const count = getCount(filter);
        const active = isActive(filter);

        return (
          <Badge
            key={filter}
            variant="outline"
            className={cn(
              'cursor-pointer transition-all px-3 py-1.5 gap-1.5 text-sm font-medium',
              active ? config.activeClass : config.inactiveClass
            )}
            onClick={() => onFilterChange(filter)}
          >
            <Icon className="h-3.5 w-3.5" />
            {config.label}
            {count > 0 && (
              <span className={cn(
                'ml-1 text-xs px-1.5 py-0.5 rounded-full',
                active ? 'bg-white/20' : 'bg-current/10'
              )}>
                {count}
              </span>
            )}
          </Badge>
        );
      })}
    </div>
  );
}
