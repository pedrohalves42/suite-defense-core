import { useAppMode, type AppMode } from '@/hooks/useAppMode';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface AppModeBadgeProps {
  collapsed?: boolean;
}

const MODE_CONFIG: Record<Exclude<AppMode, 'LOADING'>, {
  label: string;
  description: string;
  className: string;
}> = {
  FULL: {
    label: 'FULL',
    description: 'Acesso administrativo completo',
    className: 'bg-primary/10 text-primary border-primary/30 hover:bg-primary/20'
  },
  EXT: {
    label: 'EXT',
    description: 'Modo de visualização limitado',
    className: 'bg-muted text-muted-foreground border-border hover:bg-muted/80'
  }
};

export function AppModeBadge({ collapsed = false }: AppModeBadgeProps) {
  const { mode, isLoading } = useAppMode();

  if (isLoading) {
    return <Skeleton className="h-5 w-10 rounded-full" />;
  }

  const config = MODE_CONFIG[mode as Exclude<AppMode, 'LOADING'>];
  
  if (!config) return null;

  const badge = (
    <Badge 
      variant="outline"
      className={cn(
        "text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0",
        "transition-colors cursor-default",
        config.className
      )}
    >
      {config.label}
    </Badge>
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {badge}
        </TooltipTrigger>
        <TooltipContent side="right">
          <p className="font-medium">Modo {config.label}</p>
          <p className="text-xs text-muted-foreground">{config.description}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {badge}
      </TooltipTrigger>
      <TooltipContent>
        <p className="text-xs">{config.description}</p>
      </TooltipContent>
    </Tooltip>
  );
}
