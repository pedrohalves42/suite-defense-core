/**
 * Unified status mapping utilities.
 * Replaces 30+ local getStatusBadge / getStatusColor functions.
 */

import type { StatusBadgeVariant } from '@/components/ui/status-badge';

/** Canonical status categories */
export type StatusCategory = 'success' | 'warning' | 'error' | 'info' | 'neutral';

interface StatusMapping {
  label: string;
  category: StatusCategory;
  badgeVariant: StatusBadgeVariant;
}

/**
 * Master map: raw status string → display config.
 * Add entries here instead of creating local functions.
 */
const STATUS_MAP: Record<string, StatusMapping> = {
  // Job statuses
  completed: { label: 'Concluído', category: 'success', badgeVariant: 'healthy' },
  success: { label: 'Sucesso', category: 'success', badgeVariant: 'healthy' },
  passed: { label: 'Aprovado', category: 'success', badgeVariant: 'healthy' },
  running: { label: 'Executando', category: 'info', badgeVariant: 'info' },
  in_progress: { label: 'Em Progresso', category: 'info', badgeVariant: 'info' },
  pending: { label: 'Pendente', category: 'warning', badgeVariant: 'attention' },
  queued: { label: 'Na Fila', category: 'warning', badgeVariant: 'attention' },
  waiting: { label: 'Aguardando', category: 'warning', badgeVariant: 'attention' },
  failed: { label: 'Falhou', category: 'error', badgeVariant: 'critical' },
  error: { label: 'Erro', category: 'error', badgeVariant: 'critical' },
  cancelled: { label: 'Cancelado', category: 'neutral', badgeVariant: 'neutral' },
  timeout: { label: 'Timeout', category: 'warning', badgeVariant: 'attention' },
  skipped: { label: 'Pulado', category: 'neutral', badgeVariant: 'neutral' },

  // Agent statuses
  online: { label: 'Online', category: 'success', badgeVariant: 'healthy' },
  active: { label: 'Ativo', category: 'success', badgeVariant: 'healthy' },
  healthy: { label: 'Saudável', category: 'success', badgeVariant: 'healthy' },
  offline: { label: 'Offline', category: 'error', badgeVariant: 'critical' },
  inactive: { label: 'Inativo', category: 'neutral', badgeVariant: 'neutral' },
  degraded: { label: 'Degradado', category: 'warning', badgeVariant: 'attention' },
  stale: { label: 'Desatualizado', category: 'warning', badgeVariant: 'attention' },
  archived: { label: 'Arquivado', category: 'neutral', badgeVariant: 'neutral' },

  // Build statuses
  building: { label: 'Compilando', category: 'info', badgeVariant: 'info' },
  built: { label: 'Compilado', category: 'success', badgeVariant: 'healthy' },

  // Compliance / alert statuses
  verified: { label: 'Verificado', category: 'success', badgeVariant: 'healthy' },
  compliant: { label: 'Conforme', category: 'success', badgeVariant: 'healthy' },
  non_compliant: { label: 'Não Conforme', category: 'error', badgeVariant: 'critical' },
  critical: { label: 'Crítico', category: 'error', badgeVariant: 'critical' },
  high: { label: 'Alto', category: 'error', badgeVariant: 'critical' },
  medium: { label: 'Médio', category: 'warning', badgeVariant: 'attention' },
  low: { label: 'Baixo', category: 'info', badgeVariant: 'info' },
  resolved: { label: 'Resolvido', category: 'success', badgeVariant: 'healthy' },
  open: { label: 'Aberto', category: 'warning', badgeVariant: 'attention' },

  // Generic
  enabled: { label: 'Habilitado', category: 'success', badgeVariant: 'healthy' },
  disabled: { label: 'Desabilitado', category: 'neutral', badgeVariant: 'neutral' },
  unknown: { label: 'Desconhecido', category: 'neutral', badgeVariant: 'neutral' },
};

const FALLBACK: StatusMapping = {
  label: 'Desconhecido',
  category: 'neutral',
  badgeVariant: 'neutral',
};

/**
 * Get full status mapping for a raw status string.
 * Normalises to lowercase and strips whitespace.
 */
export function getStatusMapping(rawStatus: string | null | undefined): StatusMapping {
  if (!rawStatus) return FALLBACK;
  const key = rawStatus.toLowerCase().trim().replace(/\s+/g, '_');
  return STATUS_MAP[key] ?? { ...FALLBACK, label: rawStatus };
}

/** Shortcut: get StatusBadge variant for a raw status string */
export function getStatusBadgeVariant(rawStatus: string | null | undefined): StatusBadgeVariant {
  return getStatusMapping(rawStatus).badgeVariant;
}

/** Shortcut: get translated label for a raw status string */
export function getStatusLabel(rawStatus: string | null | undefined): string {
  return getStatusMapping(rawStatus).label;
}

/** Semantic Tailwind text color class per category */
const CATEGORY_COLORS: Record<StatusCategory, string> = {
  success: 'text-success',
  warning: 'text-warning',
  error: 'text-destructive',
  info: 'text-info',
  neutral: 'text-muted-foreground',
};

/** Get semantic text color class for a raw status string */
export function getStatusColor(rawStatus: string | null | undefined): string {
  return CATEGORY_COLORS[getStatusMapping(rawStatus).category];
}
