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

// Mapeamento de chaves técnicas para português amigável
const FIELD_LABELS: Record<string, string> = {
  attempt: 'Tentativa',
  success: 'Sucesso',
  component: 'Componente',
  action: 'Ação',
  version: 'Versão',
  state: 'Estado',
  job_type: 'Tipo de Tarefa',
  execution_id: 'ID da Execução',
  status: 'Status',
  error: 'Erro',
  message: 'Mensagem',
  timestamp: 'Data/Hora',
  duration: 'Duração',
  count: 'Quantidade',
  cpu: 'CPU',
  memory: 'Memória',
  disk: 'Disco',
  agent_name: 'Agente',
  hostname: 'Hostname',
  ip_address: 'Endereço IP',
  last_seen: 'Última Atividade',
  created_at: 'Criado em',
  updated_at: 'Atualizado em',
  reason: 'Motivo',
  type: 'Tipo',
  source: 'Origem',
  target: 'Destino',
  value: 'Valor',
  threshold: 'Limite',
  current: 'Atual',
  expected: 'Esperado',
};

function formatValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (typeof value === 'number') {
    if (key.includes('percent') || key === 'cpu' || key === 'memory' || key === 'disk') {
      return `${value.toFixed(1)}%`;
    }
    if (key.includes('duration') || key.includes('seconds')) {
      return `${value.toFixed(1)}s`;
    }
    return value.toLocaleString('pt-BR');
  }
  if (typeof value === 'string') {
    // Try to parse as date
    if (key.includes('at') || key.includes('timestamp') || key.includes('date')) {
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        return date.toLocaleString('pt-BR');
      }
    }
    return value;
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

function HumanizedDetails({ details }: { details: Record<string, unknown> }) {
  const entries = Object.entries(details).filter(([, v]) => v !== null && v !== undefined);
  
  if (entries.length === 0) return null;
  
  return (
    <div className="bg-muted/50 rounded-lg p-3 space-y-1.5">
      {entries.map(([key, value]) => {
        const label = FIELD_LABELS[key] || key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        const formattedValue = formatValue(key, value);
        
        return (
          <div key={key} className="flex items-start gap-2 text-sm">
            <span className="text-muted-foreground min-w-[100px] flex-shrink-0">{label}:</span>
            <span className="font-medium break-all">{formattedValue}</span>
          </div>
        );
      })}
    </div>
  );
}

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

          {/* Details in full mode - humanized */}
          {!compact && issue.details && Object.keys(issue.details).length > 0 && (
            <div className="mt-2">
              <HumanizedDetails details={issue.details} />
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
