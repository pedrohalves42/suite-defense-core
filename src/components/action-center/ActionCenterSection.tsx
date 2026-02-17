import { ReactNode, useState } from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { AlertTriangle, AlertCircle, Info, ChevronDown } from 'lucide-react';
import { ActionItem } from '@/hooks/useActionCenter';

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
  bgClassName: string;
  borderClassName: string;
  defaultOpen: boolean;
}> = {
  urgent: {
    title: 'Críticos',
    icon: AlertTriangle,
    iconClassName: 'text-red-500',
    badgeClassName: 'bg-red-500 text-white',
    bgClassName: 'bg-red-500/5',
    borderClassName: 'border-l-4 border-l-red-500',
    defaultOpen: true,
  },
  recommended: {
    title: 'Recomendados',
    icon: AlertCircle,
    iconClassName: 'text-amber-500',
    badgeClassName: 'bg-amber-500 text-white',
    bgClassName: 'bg-amber-500/5',
    borderClassName: 'border-l-4 border-l-amber-500',
    defaultOpen: false,
  },
  informational: {
    title: 'Informativos',
    icon: Info,
    iconClassName: 'text-blue-500',
    badgeClassName: 'bg-blue-500 text-white',
    bgClassName: 'bg-blue-500/5',
    borderClassName: 'border-l-4 border-l-blue-500',
    defaultOpen: false,
  },
};

export function ActionCenterSection({ type, count, children, className }: ActionCenterSectionProps) {
  const config = SECTION_CONFIG[type];
  const Icon = config.icon;
  const [isOpen, setIsOpen] = useState(config.defaultOpen);

  if (count === 0) return null;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <section className={cn(
        'rounded-lg overflow-hidden',
        config.bgClassName,
        config.borderClassName,
        className
      )}>
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className="w-full px-4 py-3 h-auto justify-between hover:bg-transparent"
          >
            <div className="flex items-center gap-2">
              <Icon className={cn('h-4 w-4', config.iconClassName)} />
              <span className="font-semibold text-sm">{config.title}</span>
              <Badge className={cn('text-xs', config.badgeClassName)}>{count}</Badge>
            </div>
            <ChevronDown className={cn(
              'h-4 w-4 text-muted-foreground transition-transform',
              isOpen && 'rotate-180'
            )} />
          </Button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-4 pb-4 space-y-2">
            {children}
          </div>
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}
