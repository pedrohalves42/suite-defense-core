/**
 * Centralized severity/status color mapping using Tailwind design tokens.
 * 
 * All color utilities in the system should use these functions instead of
 * hard-coding Tailwind color classes like `text-red-500`, `bg-green-500/10`, etc.
 * 
 * This ensures:
 * 1. Consistent severity representation across the entire UI
 * 2. Easy theme updates — change once, propagate everywhere
 * 3. Proper dark/light mode support via CSS custom properties
 */

// ─── Severity Colors ────────────────────────────────────────

export type SeverityLevel = 'critical' | 'high' | 'medium' | 'low' | 'info';

export function getSeverityTextColor(severity: string): string {
  switch (severity) {
    case 'critical': return 'text-destructive';
    case 'high': return 'text-[hsl(var(--warning))]';
    case 'medium': return 'text-[hsl(var(--warning))]';
    case 'low': return 'text-[hsl(var(--success))]';
    case 'info': return 'text-[hsl(var(--info))]';
    default: return 'text-muted-foreground';
  }
}

export function getSeverityBgColor(severity: string): string {
  switch (severity) {
    case 'critical': return 'bg-destructive/10 border-destructive/20';
    case 'high': return 'bg-[hsl(var(--warning))]/10 border-[hsl(var(--warning))]/20';
    case 'medium': return 'bg-[hsl(var(--warning))]/10 border-[hsl(var(--warning))]/20';
    case 'low': return 'bg-[hsl(var(--success))]/10 border-[hsl(var(--success))]/20';
    case 'info': return 'bg-[hsl(var(--info))]/10 border-[hsl(var(--info))]/20';
    default: return 'bg-muted';
  }
}

export function getSeverityCombo(severity: string): string {
  return `${getSeverityTextColor(severity)} ${getSeverityBgColor(severity)}`;
}

// ─── Health Status Colors ───────────────────────────────────

export function getHealthStatusTextColor(status: string): string {
  switch (status) {
    case 'healthy': return 'text-[hsl(var(--success))]';
    case 'attention':
    case 'not_polling_jobs':
    case 'not_executing_jobs':
    case 'warning': return 'text-[hsl(var(--warning))]';
    case 'execution_stale': return 'text-[hsl(var(--warning))]';
    case 'safe_mode': return 'text-[hsl(var(--info))]';
    case 'critical':
    case 'offline':
    case 'never_connected': return 'text-destructive';
    default: return 'text-muted-foreground';
  }
}

export function getHealthStatusBgColor(status: string): string {
  switch (status) {
    case 'healthy': return 'bg-[hsl(var(--success))]/10 border-[hsl(var(--success))]/20';
    case 'attention':
    case 'warning': return 'bg-[hsl(var(--warning))]/10 border-[hsl(var(--warning))]/20';
    case 'critical': return 'bg-destructive/10 border-destructive/20';
    default: return 'bg-muted';
  }
}

// ─── Incident Status Colors ────────────────────────────────

export function getIncidentStatusColor(status: string): string {
  switch (status) {
    case 'open': return 'bg-destructive/10 text-destructive border-destructive/20';
    case 'investigating': return 'bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/20';
    case 'contained': return 'bg-[hsl(var(--info))]/10 text-[hsl(var(--info))] border-[hsl(var(--info))]/20';
    case 'resolved': return 'bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] border-[hsl(var(--success))]/20';
    case 'closed': return 'bg-muted text-muted-foreground border-border';
    default: return 'bg-muted text-muted-foreground border-border';
  }
}

// ─── Risk Level Colors ──────────────────────────────────────

export function getRiskLevelColor(level: string): string {
  switch (level) {
    case 'critical': return 'text-destructive bg-destructive/10';
    case 'high': return 'text-[hsl(var(--warning))] bg-[hsl(var(--warning))]/10';
    case 'medium': return 'text-[hsl(var(--warning))] bg-[hsl(var(--warning))]/10';
    case 'low': return 'text-[hsl(var(--success))] bg-[hsl(var(--success))]/10';
    default: return 'text-muted-foreground bg-muted/10';
  }
}

// ─── Risk Delta Colors ──────────────────────────────────────

export function getRiskDeltaColor(delta: number): string {
  if (delta === 0) return 'text-muted-foreground';
  if (delta < 0) return 'text-[hsl(var(--success))]';
  return 'text-destructive';
}

// ─── Burn Rate / SLO Colors ────────────────────────────────

export interface BurnRateColorInfo {
  level: string;
  text: string;
  bg: string;
  label: string;
  labelEn: string;
}

export function getBurnRateColors(rate: number): BurnRateColorInfo {
  if (rate >= 5) {
    return { level: 'critical', text: 'text-destructive', bg: 'bg-destructive/10', label: 'CRÍTICO', labelEn: 'CRITICAL' };
  }
  if (rate >= 2) {
    return { level: 'high', text: 'text-[hsl(var(--warning))]', bg: 'bg-[hsl(var(--warning))]/10', label: 'ALTO', labelEn: 'HIGH' };
  }
  if (rate >= 1.5) {
    return { level: 'warning', text: 'text-[hsl(var(--warning))]', bg: 'bg-[hsl(var(--warning))]/10', label: 'ATENÇÃO', labelEn: 'WARNING' };
  }
  if (rate >= 1) {
    return { level: 'alert', text: 'text-[hsl(var(--warning))]', bg: 'bg-[hsl(var(--warning))]/10', label: 'ALERTA', labelEn: 'ALERT' };
  }
  return { level: 'ok', text: 'text-[hsl(var(--success))]', bg: 'bg-[hsl(var(--success))]/10', label: 'OK', labelEn: 'OK' };
}

// ─── Error Budget Color ─────────────────────────────────────

export function getErrorBudgetBarColor(consumed: number): string {
  if (consumed >= 80) return 'bg-destructive';
  if (consumed >= 50) return 'bg-[hsl(var(--warning))]';
  if (consumed >= 30) return 'bg-[hsl(var(--warning))]';
  return 'bg-[hsl(var(--success))]';
}

// ─── Threat Level Colors ────────────────────────────────────

export function getThreatLevelTextColor(level: string): string {
  switch (level) {
    case 'critical': return 'text-destructive';
    case 'high': return 'text-[hsl(var(--warning))]';
    case 'medium': return 'text-[hsl(var(--warning))]';
    case 'low': return 'text-[hsl(var(--success))]';
    default: return 'text-muted-foreground';
  }
}

export function getThreatLevelBgColor(level: string): string {
  switch (level) {
    case 'critical': return 'bg-destructive/10 border-destructive/20';
    case 'high': return 'bg-[hsl(var(--warning))]/10 border-[hsl(var(--warning))]/20';
    case 'medium': return 'bg-[hsl(var(--warning))]/10 border-[hsl(var(--warning))]/20';
    case 'low': return 'bg-[hsl(var(--success))]/10 border-[hsl(var(--success))]/20';
    default: return 'bg-muted';
  }
}
