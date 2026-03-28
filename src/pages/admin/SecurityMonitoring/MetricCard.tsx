import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface MetricCardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  variant: 'danger' | 'warning' | 'neutral';
  subtitle?: string;
}

export function MetricCard({ label, value, icon, variant, subtitle }: MetricCardProps) {
  const styles = {
    danger: 'border-destructive/20 bg-destructive/5',
    warning: 'border-amber-500/20 bg-amber-500/5',
    neutral: 'bg-card border-border/40',
  }[variant];
  const valueColor = {
    danger: 'text-destructive',
    warning: 'text-amber-500',
    neutral: 'text-foreground',
  }[variant];
  const iconColor = {
    danger: 'text-destructive/70',
    warning: 'text-amber-500/70',
    neutral: 'text-muted-foreground',
  }[variant];

  return (
    <Card className={cn("border transition-all hover:shadow-md", styles)}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] text-muted-foreground font-medium leading-tight">{label}</span>
          <span className={iconColor}>{icon}</span>
        </div>
        <p className={cn("text-3xl font-bold tracking-tight", valueColor)}>{value}</p>
        {subtitle && (
          <p className="text-[10px] text-muted-foreground mt-0.5">{subtitle}</p>
        )}
      </CardContent>
    </Card>
  );
}
