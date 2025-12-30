/**
 * DiagnosticIssuesList - Lista modular de issues de diagnóstico
 * 
 * Suporta:
 * - Modo compacto (top N issues)
 * - Modo completo (todas as issues com detalhes)
 * 
 * Componente puro, recebe issues via props.
 */

import { Badge } from '@/components/ui/badge';
import { AlertCircle, AlertTriangle, Info, XCircle } from 'lucide-react';
import { 
  type DiagnosticIssue, 
  getSeverityColor, 
  getSeverityBorderColor, 
  getSeverityLabel 
} from '@/types/diagnostic';

const SEVERITY_ICONS = {
  critical: XCircle,
  high: AlertTriangle,
  medium: AlertCircle,
  info: Info,
} as const;

interface DiagnosticIssueItemProps {
  issue: DiagnosticIssue;
  compact?: boolean;
}

function DiagnosticIssueItem({ issue, compact }: DiagnosticIssueItemProps) {
  const Icon = SEVERITY_ICONS[issue.severity] || AlertCircle;
  
  return (
    <div className={`p-3 rounded-lg border-l-4 bg-card ${getSeverityBorderColor(issue.severity)}`}>
      <div className="flex items-start gap-3">
        <Icon className={`h-5 w-5 flex-shrink-0 mt-0.5 ${
          issue.severity === 'critical' ? 'text-destructive' :
          issue.severity === 'high' ? 'text-orange-500' :
          issue.severity === 'medium' ? 'text-yellow-500' :
          'text-blue-500'
        }`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{issue.description}</span>
            <Badge className={`${getSeverityColor(issue.severity)} text-xs`}>
              {getSeverityLabel(issue.severity)}
            </Badge>
          </div>
          {!compact && issue.details && Object.keys(issue.details).length > 0 && (
            <div className="mt-2">
              <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                {JSON.stringify(issue.details, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface DiagnosticIssuesListProps {
  issues: DiagnosticIssue[];
  compact?: boolean;
  maxItems?: number;
  showRemainingCount?: boolean;
  className?: string;
}

export function DiagnosticIssuesList({ 
  issues, 
  compact = false, 
  maxItems,
  showRemainingCount = true,
  className = ''
}: DiagnosticIssuesListProps) {
  const displayIssues = maxItems ? issues.slice(0, maxItems) : issues;
  const remainingCount = maxItems ? issues.length - maxItems : 0;

  if (issues.length === 0) {
    return (
      <div className={`text-center py-4 text-muted-foreground text-sm ${className}`}>
        Nenhum problema detectado
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {displayIssues.map((issue, idx) => (
        <DiagnosticIssueItem key={idx} issue={issue} compact={compact} />
      ))}
      
      {showRemainingCount && remainingCount > 0 && (
        <p className="text-xs text-muted-foreground text-center py-2">
          + {remainingCount} problema{remainingCount > 1 ? 's' : ''} adiciona{remainingCount > 1 ? 'is' : 'l'}
        </p>
      )}
    </div>
  );
}
