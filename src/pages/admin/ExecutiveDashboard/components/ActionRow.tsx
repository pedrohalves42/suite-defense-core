import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface ActionRowProps {
  icon: React.ReactNode;
  label: string;
  count: number;
  description: string;
  tooltip?: string;
}

export function ActionRow({ icon, label, count, description, tooltip }: ActionRowProps) {
  const content = (
    <div className="flex items-start gap-2 py-1.5 border-b border-border/30 last:border-0">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium truncate">{label}</span>
          <Badge variant="secondary" className="text-[10px] h-4 px-1.5 ml-2 shrink-0">{count}x</Badge>
        </div>
        <p className="text-[10px] text-muted-foreground/70 mt-0.5">{description}</p>
      </div>
    </div>
  );

  if (tooltip) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="cursor-help">{content}</div>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs"><p>{tooltip}</p></TooltipContent>
      </Tooltip>
    );
  }

  return content;
}
