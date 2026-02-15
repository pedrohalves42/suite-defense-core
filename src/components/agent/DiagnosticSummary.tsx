/**
 * DiagnosticSummary - Resumo de diagnóstico com indicadores por severidade
 * Design: Premium enterprise, minimalista
 */

import { Badge } from '@/components/ui/badge';
import { ShieldAlert, ShieldX, AlertTriangle, Info } from 'lucide-react';
import { type DiagnosticSummary as DiagnosticSummaryType } from '@/types/diagnostic';

interface DiagnosticSummaryProps {
  summary: DiagnosticSummaryType;
  compact?: boolean;
}

export function DiagnosticSummary({ summary, compact = false }: DiagnosticSummaryProps) {
  const items = [
    { count: summary.critical, label: 'Crítico', icon: ShieldX, className: 'bg-destructive/10 text-destructive border-destructive/20' },
    { count: summary.high, label: 'Alto', icon: ShieldAlert, className: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20' },
    { count: summary.medium, label: 'Médio', icon: AlertTriangle, className: 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20' },
    { count: summary.info, label: 'Info', icon: Info, className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20' },
  ].filter(i => i.count > 0);

  if (summary.total === 0) {
    return (
      <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
        Nenhum problema
      </Badge>
    );
  }

  return (
    <div className={`flex flex-wrap ${compact ? 'gap-1.5' : 'gap-2'}`}>
      {items.map(({ count, label, icon: Icon, className }) => (
        <Badge
          key={label}
          variant="outline"
          className={`${className} ${compact ? 'text-[10px] px-1.5 py-0' : 'text-xs px-2 py-0.5'} font-medium gap-1 border`}
        >
          <Icon className={compact ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
          {count} {label}{count > 1 ? 's' : ''}
        </Badge>
      ))}
    </div>
  );
}
