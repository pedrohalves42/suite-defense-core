import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { HelpTip } from './HelpTip';

export function MetricTile({ icon: Icon, label, value, color, help }: {
  icon: React.ElementType; label: string; value: number; color: string; help: string;
}) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={cn("p-2.5 rounded-xl",
            color === 'text-primary' && 'bg-primary/10',
            color === 'text-destructive' && 'bg-destructive/10',
            color === 'text-warning' && 'bg-warning/10',
            color === 'text-success' && 'bg-success/10'
          )}>
            <Icon className={cn("h-5 w-5", color)} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-2xl font-bold leading-none">{value}</p>
            <p className="text-xs text-muted-foreground mt-1 flex items-center">
              {label}
              <HelpTip text={help} />
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
