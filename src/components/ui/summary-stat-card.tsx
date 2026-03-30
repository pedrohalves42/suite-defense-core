/**
 * SummaryStatCard — compact stat card used in summary grids.
 * Replaces the repeated Card > CardContent > icon + value + label pattern.
 */

import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

interface SummaryStatCardProps {
  icon: LucideIcon;
  value: string | number;
  label: string;
  /** Semantic accent: maps to design tokens */
  accent?: 'destructive' | 'warning' | 'success' | 'info' | 'muted' | 'primary';
  className?: string;
}

const ACCENT_STYLES: Record<string, { border: string; bg: string; icon: string; value: string }> = {
  destructive: {
    border: 'border-destructive/50',
    bg: 'bg-destructive/5',
    icon: 'text-destructive',
    value: 'text-destructive',
  },
  warning: {
    border: 'border-warning/50',
    bg: 'bg-warning/5',
    icon: 'text-warning',
    value: 'text-warning',
  },
  success: {
    border: 'border-success/50',
    bg: 'bg-success/5',
    icon: 'text-success',
    value: 'text-success',
  },
  info: {
    border: 'border-info/50',
    bg: 'bg-info/5',
    icon: 'text-info',
    value: 'text-info',
  },
  primary: {
    border: '',
    bg: '',
    icon: 'text-primary',
    value: '',
  },
  muted: {
    border: '',
    bg: '',
    icon: 'text-muted-foreground',
    value: '',
  },
};

export function SummaryStatCard({
  icon: Icon,
  value,
  label,
  accent = 'muted',
  className,
}: SummaryStatCardProps) {
  const styles = ACCENT_STYLES[accent] || ACCENT_STYLES.muted;

  return (
    <Card className={cn(styles.border, styles.bg, className)}>
      <CardContent className="pt-4">
        <div className="flex items-center gap-2">
          <Icon className={cn('h-5 w-5', styles.icon)} />
          <div>
            <p className={cn('text-2xl font-bold', styles.value)}>{value}</p>
            <p className="text-sm text-muted-foreground">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
