import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, AlertCircle, Info } from 'lucide-react';

type SectionType = 'urgent' | 'recommended' | 'informational';

interface ActionCenterSectionProps {
  type: SectionType;
  count: number;
  children: ReactNode;
  className?: string;
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

export function ActionCenterSection({ type, count, children, className }: ActionCenterSectionProps) {
  const config = SECTION_CONFIG[type];
  const Icon = config.icon;

  if (count === 0) return null;

  return (
    <section className={cn('space-y-3', className)}>
      <div className="flex items-center gap-2">
        <span className="text-lg">{config.emoji}</span>
        <Icon className={cn('h-5 w-5', config.iconClassName)} />
        <h2 className="text-lg font-semibold">{config.title}</h2>
        <Badge className={config.badgeClassName}>{count}</Badge>
      </div>
      <div className="space-y-3">
        {children}
      </div>
    </section>
  );
}
