import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

type StatsVariant = 'default' | 'success' | 'warning' | 'danger' | 'info';

interface StatsCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon?: LucideIcon;
  variant?: StatsVariant;
  trend?: { value: number; isPositive: boolean };
  className?: string;
}

const variantStyles: Record<StatsVariant, string> = {
  default: 'border-l-primary/50',
  success: 'border-l-green-500',
  warning: 'border-l-amber-500',
  danger: 'border-l-red-500',
  info: 'border-l-blue-500',
};

export function StatsCard({
  title,
  value,
  description,
  icon: Icon,
  variant = 'default',
  trend,
  className,
}: StatsCardProps) {
  return (
    <Card className={cn(
      "stats-card-enterprise card-enterprise-hover",
      variantStyles[variant],
      className
    )}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground/80">
          {title}
        </CardTitle>
        {Icon && <Icon className="h-4 w-4 text-muted-foreground/50" />}
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-foreground">{value}</span>
          {trend && (
            <span className={cn(
              "text-xs font-medium",
              trend.isPositive ? "text-green-500" : "text-red-500"
            )}>
              {trend.isPositive ? '↑' : '↓'} {Math.abs(trend.value)}%
            </span>
          )}
        </div>
        {description && (
          <p className="text-xs text-muted-foreground/60 mt-1">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}
