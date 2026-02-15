/**
 * DiagnosticIssuesList - Lista de issues de diagnóstico
 * Design: Premium enterprise, limpo e direto
 */

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ShieldAlert, ShieldX, AlertTriangle, Info, Users, Settings, Zap, ChevronRight } from 'lucide-react';
import { 
  type DiagnosticIssue, 
  getSeverityColor, 
  getSeverityLabel 
} from '@/types/diagnostic';
import { getRecommendedAction } from '@/lib/diagnostic-actions';
import { getHumanizedExplanation, getConfidenceBadge } from '@/lib/diagnostic-humanizer';

const SEVERITY_ICONS = {
  critical: ShieldX,
  high: ShieldAlert,
  medium: AlertTriangle,
  info: Info,
} as const;

const SEVERITY_ACCENT = {
  critical: 'border-l-destructive bg-destructive/5',
  high: 'border-l-orange-500 bg-orange-500/5',
  medium: 'border-l-yellow-500 bg-yellow-500/5',
  info: 'border-l-blue-500 bg-blue-500/5',
} as const;

const SEVERITY_ICON_COLOR = {
  critical: 'text-destructive',
  high: 'text-orange-500',
  medium: 'text-yellow-600 dark:text-yellow-400',
  info: 'text-blue-500',
} as const;

const FIELD_LABELS: Record<string, string> = {
  attempt: 'Tentativa', success: 'Sucesso', component: 'Componente',
  action: 'Ação', version: 'Versão', state: 'Estado',
  job_type: 'Tarefa', status: 'Status', error: 'Erro',
  message: 'Mensagem', count: 'Qtd', cpu: 'CPU',
  memory: 'Memória', disk: 'Disco', reason: 'Motivo',
  type: 'Tipo', source: 'Origem', value: 'Valor',
  threshold: 'Limite', current: 'Atual', expected: 'Esperado',
};

const ISSUE_TYPE_LABELS: Record<string, string> = {
  state_change: 'Mudança de estado',
  heartbeat_missing: 'Sem comunicação',
  offline: 'Offline',
  connection_lost: 'Conexão perdida',
  security_event: 'Evento de segurança',
  malware_detected: 'Malware detectado',
  suspicious_activity: 'Atividade suspeita',
  policy_violation: 'Violação de política',
  unauthorized_access: 'Acesso não autorizado',
  component_error: 'Erro em componente',
  service_stopped: 'Serviço parado',
  service_degraded: 'Serviço degradado',
  update_failed: 'Falha na atualização',
  policy_drift: 'Desvio de política',
  config_mismatch: 'Configuração divergente',
  resource_warning: 'Alerta de recursos',
  disk_full: 'Disco cheio',
  memory_high: 'Memória elevada',
  cpu_high: 'CPU elevada',
  agent_not_found: 'Agente não encontrado',
  agent_archived: 'Agente arquivado',
  // Extended check_key translations
  antivirus_outdated: 'Antivírus desatualizado',
  antivirus_disabled: 'Antivírus desativado',
  firewall_disabled: 'Firewall desativado',
  windows_update_disabled: 'Windows Update desativado',
  uac_disabled: 'Controle de conta desativado (UAC)',
  rdp_open: 'Área de trabalho remota exposta',
  service_not_running: 'Serviço crítico parado',
  cert_expired: 'Certificado expirado',
  cert_expiring: 'Certificado próximo do vencimento',
  weak_password_policy: 'Política de senha fraca',
  admin_account_active: 'Conta admin local ativa',
  guest_account_active: 'Conta de convidado ativa',
  bitlocker_disabled: 'Criptografia de disco desativada',
  smb_v1_enabled: 'SMBv1 habilitado (vulnerável)',
  auto_login_enabled: 'Login automático ativado',
  screen_lock_disabled: 'Bloqueio de tela desativado',
  dns_anomaly: 'Anomalia de DNS detectada',
  high_network_usage: 'Tráfego de rede elevado',
  process_anomaly: 'Processo anômalo detectado',
  file_integrity_violation: 'Violação de integridade de arquivo',
  baseline_deviation: 'Desvio do padrão comportamental',
};

function getIssueTypeLabel(issueType: string): string {
  return ISSUE_TYPE_LABELS[issueType] || 
    issueType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function formatValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (typeof value === 'number') {
    if (key.includes('percent') || key === 'cpu' || key === 'memory' || key === 'disk') return `${value.toFixed(1)}%`;
    if (key.includes('duration') || key.includes('seconds')) return `${value.toFixed(1)}s`;
    return value.toLocaleString('pt-BR');
  }
  if (typeof value === 'string') {
    if (key.includes('at') || key.includes('timestamp') || key.includes('date')) {
      const date = new Date(value);
      if (!isNaN(date.getTime())) return date.toLocaleString('pt-BR');
    }
    return value;
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function IssueDetails({ details }: { details: Record<string, unknown> }) {
  const entries = Object.entries(details).filter(([, v]) => v !== null && v !== undefined);
  if (entries.length === 0) return null;
  
  return (
    <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs bg-muted/30 rounded-md p-2.5 border border-border/50">
      {entries.map(([key, value]) => (
        <div key={key} className="flex items-baseline gap-1.5">
          <span className="text-muted-foreground truncate">
            {FIELD_LABELS[key] || key.replace(/_/g, ' ')}:
          </span>
          <span className="font-medium truncate">{formatValue(key, value)}</span>
        </div>
      ))}
    </div>
  );
}

function OriginBadge({ origin }: { origin: DiagnosticIssue['origin'] }) {
  if (!origin) return null;
  
  const config: Record<string, { icon: typeof Users; label: string }> = {
    group_policy: { icon: Users, label: origin.source_name || 'Política de Grupo' },
    agent_config: { icon: Settings, label: 'Config Local' },
    system: { icon: Info, label: 'Automático' },
    network: { icon: Info, label: 'Rede' },
    user_action: { icon: Settings, label: 'Manual' },
  };
  
  const { icon: Icon, label } = config[origin.type] || config.system;
  
  return (
    <Badge variant="outline" className="text-[10px] gap-1 font-normal text-muted-foreground border-border/50">
      <Icon className="h-2.5 w-2.5" />
      {label}
    </Badge>
  );
}

function DiagnosticIssueItem({ issue, compact, showActions = true, onAction }: {
  issue: DiagnosticIssue;
  compact?: boolean;
  showActions?: boolean;
  onAction?: (actionKey: string, issue: DiagnosticIssue) => void;
}) {
  const Icon = SEVERITY_ICONS[issue.severity] || AlertTriangle;
  const recommendedAction = issue.recommended_action_key 
    ? getRecommendedAction(issue.recommended_action_key)
    : getRecommendedAction(issue.issue_type);
  const isCriticalOrHigh = issue.severity === 'critical' || issue.severity === 'high';
  const humanized = getHumanizedExplanation(issue.issue_type);
  const confidenceBadge = getConfidenceBadge(humanized.confidence);
  
  return (
    <div className={`rounded-lg border-l-[3px] border border-border/40 transition-colors hover:bg-accent/5 ${SEVERITY_ACCENT[issue.severity] || 'border-l-muted'}`}>
      <div className="p-3 flex items-start gap-3">
        <div className={`mt-0.5 p-1 rounded ${SEVERITY_ICON_COLOR[issue.severity]}`}>
          <Icon className="h-4 w-4" />
        </div>
        
        <div className="flex-1 min-w-0 space-y-1.5">
          {/* Title row */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm leading-tight">
              {issue.description || getIssueTypeLabel(issue.issue_type)}
            </span>
            <Badge className={`${getSeverityColor(issue.severity)} text-[10px] px-1.5 py-0 font-medium`}>
              {getSeverityLabel(issue.severity)}
            </Badge>
            {!compact && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant={confidenceBadge.variant} className={`text-[10px] px-1.5 py-0 ${confidenceBadge.className}`}>
                      {confidenceBadge.label}
                    </Badge>
                  </TooltipTrigger>
                  {humanized.confidenceReason && (
                    <TooltipContent><p className="text-xs max-w-[200px]">{humanized.confidenceReason}</p></TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            )}
          </div>

          {/* Origin */}
          {!compact && issue.origin && <OriginBadge origin={issue.origin} />}

          {/* Details */}
          {!compact && issue.details && Object.keys(issue.details).length > 0 && (
            <IssueDetails details={issue.details} />
          )}

          {/* Action */}
          {!compact && showActions && isCriticalOrHigh && recommendedAction && (
            <div className="mt-2">
              <Button 
                variant="outline" 
                size="sm" 
                className="h-7 text-xs gap-1.5 hover:bg-primary hover:text-primary-foreground transition-colors"
                onClick={() => onAction?.(recommendedAction.action_key, issue)}
              >
                <Zap className="h-3 w-3" />
                {recommendedAction.label}
                <ChevronRight className="h-3 w-3" />
              </Button>
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
  issues, compact = false, maxItems, showRemainingCount = true,
  showActions = true, onAction, className = ''
}: DiagnosticIssuesListProps) {
  const displayIssues = maxItems ? issues.slice(0, maxItems) : issues;
  const remainingCount = maxItems ? issues.length - maxItems : 0;

  if (issues.length === 0) {
    return (
      <div className={`text-center py-6 text-muted-foreground text-sm ${className}`}>
        Nenhum problema identificado
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {displayIssues.map((issue, idx) => (
        <DiagnosticIssueItem 
          key={idx} issue={issue} compact={compact}
          showActions={showActions} onAction={onAction}
        />
      ))}
      {showRemainingCount && remainingCount > 0 && (
        <p className="text-xs text-muted-foreground text-center py-2 font-medium">
          + {remainingCount} {remainingCount === 1 ? 'problema adicional' : 'problemas adicionais'}
        </p>
      )}
    </div>
  );
}
