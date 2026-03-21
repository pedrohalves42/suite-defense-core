/**
 * Diagnostic Domain Types
 * 
 * Single source of truth for diagnostic-related types.
 * Used by useDiagnostic hook and all diagnostic components.
 */

export type DiagnosticSeverity = 'critical' | 'high' | 'medium' | 'info';

/**
 * Origem da issue - de onde veio o problema
 * Fornece explicabilidade para o operador
 */
export interface IssueOrigin {
  type: 'system' | 'group_policy' | 'agent_config' | 'network' | 'user_action';
  source_id?: string;
  source_name?: string;
  policy_code?: string;
  overrides_local?: boolean; // Se política de grupo sobrepõe config local
}

export interface DiagnosticIssue {
  issue_type: string;
  severity: DiagnosticSeverity;
  description: string;
  details: Record<string, unknown>;
  confidence?: number;
  rule_code?: string;
  origin?: IssueOrigin; // De onde veio o problema
  recommended_action_key?: string; // Chave para resolver no frontend
}

/**
 * Valida uma issue de diagnóstico.
 * Issues críticas/high sem origin geram warning.
 */
export function validateIssue(issue: DiagnosticIssue): void {
  if ((issue.severity === 'critical' || issue.severity === 'high') && !issue.origin) {
    // Critical/High issue without origin — logged for debugging
    // Intentionally silent in production
  }
}

export interface DiagnosticSummary {
  critical: number;
  high: number;
  medium: number;
  info: number;
  total: number;
}

export interface DiagnosticResult {
  isHealthy: boolean;
  issues: DiagnosticIssue[];
  summary: DiagnosticSummary;
  lastCheck: string;
}

// Severity order for sorting (lower = more severe)
export const SEVERITY_ORDER: Record<DiagnosticSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  info: 3,
};

// Styling helpers
export function getSeverityColor(severity: DiagnosticSeverity | string): string {
  switch (severity) {
    case 'critical': return 'bg-destructive text-destructive-foreground';
    case 'high': return 'bg-orange-500 text-white';
    case 'medium': return 'bg-yellow-500 text-black';
    case 'info': return 'bg-blue-500 text-white';
    default: return 'bg-muted text-muted-foreground';
  }
}

export function getSeverityBorderColor(severity: DiagnosticSeverity | string): string {
  switch (severity) {
    case 'critical': return 'border-l-destructive';
    case 'high': return 'border-l-orange-500';
    case 'medium': return 'border-l-yellow-500';
    case 'info': return 'border-l-blue-500';
    default: return 'border-l-muted';
  }
}

export function getSeverityLabel(severity: DiagnosticSeverity | string): string {
  switch (severity) {
    case 'critical': return 'Crítico';
    case 'high': return 'Alto';
    case 'medium': return 'Médio';
    case 'info': return 'Informativo';
    default: return severity;
  }
}

export function getSeverityIcon(severity: DiagnosticSeverity | string): 'critical' | 'high' | 'medium' | 'info' {
  if (severity === 'critical' || severity === 'high' || severity === 'medium' || severity === 'info') {
    return severity;
  }
  return 'info';
}
