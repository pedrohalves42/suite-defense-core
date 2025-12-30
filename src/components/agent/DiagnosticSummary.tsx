/**
 * DiagnosticSummary - Resumo de diagnóstico com badges por severidade
 * 
 * Componente puro que exibe contadores de issues por severidade.
 * Usado tanto no DiagnosticPanel quanto standalone.
 */

import { Badge } from '@/components/ui/badge';
import { AlertCircle, AlertTriangle, Info, XCircle } from 'lucide-react';
import { type DiagnosticSummary as DiagnosticSummaryType } from '@/types/diagnostic';

interface DiagnosticSummaryProps {
  summary: DiagnosticSummaryType;
  compact?: boolean;
}

export function DiagnosticSummary({ summary, compact = false }: DiagnosticSummaryProps) {
  const baseClasses = compact ? 'gap-1.5' : 'gap-2';
  const badgeSize = compact ? 'text-[10px]' : 'text-xs';
  const iconSize = compact ? 'h-2.5 w-2.5' : 'h-3 w-3';

  return (
    <div className={`flex flex-wrap ${baseClasses}`}>
      {summary.critical > 0 && (
        <Badge variant="destructive" className={`gap-1 ${badgeSize}`}>
          <XCircle className={iconSize} />
          {summary.critical} crítico{summary.critical > 1 ? 's' : ''}
        </Badge>
      )}
      {summary.high > 0 && (
        <Badge className={`bg-orange-500 text-white gap-1 ${badgeSize}`}>
          <AlertTriangle className={iconSize} />
          {summary.high} alto{summary.high > 1 ? 's' : ''}
        </Badge>
      )}
      {summary.medium > 0 && (
        <Badge className={`bg-yellow-500 text-black gap-1 ${badgeSize}`}>
          <AlertCircle className={iconSize} />
          {summary.medium} médio{summary.medium > 1 ? 's' : ''}
        </Badge>
      )}
      {summary.info > 0 && (
        <Badge className={`bg-blue-500 text-white gap-1 ${badgeSize}`}>
          <Info className={iconSize} />
          {summary.info} info
        </Badge>
      )}
      {summary.total === 0 && (
        <Badge variant="secondary" className={badgeSize}>
          Nenhum problema
        </Badge>
      )}
    </div>
  );
}
