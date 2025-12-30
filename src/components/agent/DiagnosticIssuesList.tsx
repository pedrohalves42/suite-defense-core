/**
 * DiagnosticIssuesList - Lista modular de issues de diagnóstico
 * 
 * Suporta:
 * - Modo compacto (top N issues)
 * - Modo completo (todas as issues com detalhes)
 * - Exibição de origin (grupo, config local, sistema)
 * - Ações recomendadas para issues críticas
 * 
 * Componente puro, recebe issues via props.
 */

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertCircle, AlertTriangle, Info, XCircle, Users, Settings, Zap } from 'lucide-react';
import { 
  type DiagnosticIssue, 
  getSeverityColor, 
  getSeverityBorderColor, 
  getSeverityLabel 
} from '@/types/diagnostic';
import { getRecommendedAction } from '@/lib/diagnostic-actions';

const SEVERITY_ICONS = {
  critical: XCircle,
  high: AlertTriangle,
  medium: AlertCircle,
  info: Info,
} as const;

interface DiagnosticIssueItemProps {
  issue: DiagnosticIssue;
  compact?: boolean;
  showActions?: boolean;
  onAction?: (actionKey: string, issue: DiagnosticIssue) => void;
}

function DiagnosticIssueItem({ issue, compact, showActions = true, onAction }: DiagnosticIssueItemProps) {
  const Icon = SEVERITY_ICONS[issue.severity] || AlertCircle;
  // Resolve action by key first, fallback to issue_type
  const recommendedAction = issue.recommended_action_key 
    ? getRecommendedAction(issue.recommended_action_key)
    : getRecommendedAction(issue.issue_type);
  const isCriticalOrHigh = issue.severity === 'critical' || issue.severity === 'high';
  
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
          
          {/* Origin badge - shows where the issue came from */}
          {!compact && issue.origin && (
            <div className="mt-1.5 flex items-center gap-2 flex-wrap">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className={`text-xs gap-1 ${issue.origin.overrides_local ? 'border-orange-500/50 text-orange-600' : ''}`}>
                      {issue.origin.type === 'group_policy' && (
                        <>
                          <Users className="h-3 w-3" />
                          {issue.origin.source_name || 'Política de Grupo'}
                          {issue.origin.overrides_local && <span className="text-[10px] opacity-75">• Sobrepõe</span>}
                        </>
                      )}
                      {issue.origin.type === 'agent_config' && (
                        <>
                          <Settings className="h-3 w-3" />
                          Configuração Local
                        </>
                      )}
                      {issue.origin.type === 'system' && (
                        <>
                          <AlertCircle className="h-3 w-3" />
                          Detecção Automática
                        </>
                      )}
                      {issue.origin.type === 'network' && (
                        <>
                          <AlertCircle className="h-3 w-3" />
                          Rede
                        </>
                      )}
                      {issue.origin.type === 'user_action' && (
                        <>
                          <Settings className="h-3 w-3" />
                          Ação Manual
                        </>
                      )}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    {issue.origin.overrides_local && issue.origin.source_name
                      ? `Política do grupo "${issue.origin.source_name}" sobrepõe configuração local`
                      : issue.origin.overrides_local
                      ? 'Política de grupo sobrepõe configuração local'
                      : `Origem: ${issue.origin.type}`
                    }
                    {issue.origin.policy_code && (
                      <span className="block text-xs opacity-75">
                        Política: {issue.origin.policy_code}
                      </span>
                    )}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          )}

          {/* Details in full mode */}
          {!compact && issue.details && Object.keys(issue.details).length > 0 && (
            <div className="mt-2">
              <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                {JSON.stringify(issue.details, null, 2)}
              </pre>
            </div>
          )}

          {/* Recommended action for critical/high issues */}
          {!compact && showActions && isCriticalOrHigh && recommendedAction && (
            <div className="mt-2 flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                className="h-7 text-xs"
                onClick={() => onAction?.(recommendedAction.action_key, issue)}
              >
                <Zap className="h-3 w-3 mr-1" />
                {recommendedAction.label}
              </Button>
              {recommendedAction.description && (
                <span className="text-xs text-muted-foreground">
                  {recommendedAction.description}
                </span>
              )}
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
  showActions?: boolean;
  onAction?: (actionKey: string, issue: DiagnosticIssue) => void;
  className?: string;
}

export function DiagnosticIssuesList({ 
  issues, 
  compact = false, 
  maxItems,
  showRemainingCount = true,
  showActions = true,
  onAction,
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
        <DiagnosticIssueItem 
          key={idx} 
          issue={issue} 
          compact={compact}
          showActions={showActions}
          onAction={onAction}
        />
      ))}
      
      {showRemainingCount && remainingCount > 0 && (
        <p className="text-xs text-muted-foreground text-center py-2">
          + {remainingCount} problema{remainingCount > 1 ? 's' : ''} adiciona{remainingCount > 1 ? 'is' : 'l'}
        </p>
      )}
    </div>
  );
}
