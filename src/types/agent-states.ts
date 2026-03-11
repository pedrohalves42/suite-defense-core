// ========================================
// Agent Semantic States
// Purpose: Rich agent status with detailed offline reasons
// ========================================

export type OfflineReason = 
  | 'shutdown'           // Agent gracefully shut down
  | 'network_unreachable' // Lost connectivity
  | 'agent_crash'         // Process crashed
  | 'version_incompatible' // Incompatible version
  | 'unknown';            // Undetermined reason

export type DetailedAgentStatus = 
  | 'online'              // Active and healthy
  | 'stale_heartbeat'     // Heartbeat between 5-30 min old
  | 'offline_shutdown'    // Gracefully powered off
  | 'offline_network'     // Network unreachable
  | 'offline_crash'       // Agent crashed
  | 'offline_version'     // Incompatible version
  | 'offline_unknown'     // Unknown offline reason
  | 'never_connected'     // Never sent heartbeat
  | 'inactive';           // Marked as inactive

export interface AgentStatusConfig {
  label: string;
  labelEn: string;
  color: 'success' | 'warning' | 'error' | 'muted' | 'info';
  icon: 'online' | 'stale' | 'shutdown' | 'network' | 'crash' | 'version' | 'unknown' | 'never' | 'inactive';
  description: string;
}

export const AGENT_STATUS_CONFIG: Record<DetailedAgentStatus, AgentStatusConfig> = {
  online: {
    label: 'Online',
    labelEn: 'Online',
    color: 'success',
    icon: 'online',
    description: 'Agente conectado e funcionando normalmente',
  },
  stale_heartbeat: {
    label: 'Heartbeat Atrasado',
    labelEn: 'Stale Heartbeat',
    color: 'warning',
    icon: 'stale',
    description: 'Último heartbeat entre 5-30 minutos atrás',
  },
  offline_shutdown: {
    label: 'Desligado',
    labelEn: 'Powered Off',
    color: 'muted',
    icon: 'shutdown',
    description: 'Computador desligado normalmente',
  },
  offline_network: {
    label: 'Sem Rede',
    labelEn: 'Network Unreachable',
    color: 'error',
    icon: 'network',
    description: 'Agente sem conectividade de rede',
  },
  offline_crash: {
    label: 'Crash Detectado',
    labelEn: 'Agent Crashed',
    color: 'error',
    icon: 'crash',
    description: 'Processo do agente crashou inesperadamente',
  },
  offline_version: {
    label: 'Versão Incompatível',
    labelEn: 'Incompatible Version',
    color: 'warning',
    icon: 'version',
    description: 'Versão do agente não é compatível',
  },
  offline_unknown: {
    label: 'Offline',
    labelEn: 'Offline',
    color: 'error',
    icon: 'unknown',
    description: 'Agente offline por motivo desconhecido',
  },
  never_connected: {
    label: 'Nunca Conectou',
    labelEn: 'Never Connected',
    color: 'muted',
    icon: 'never',
    description: 'Agente nunca enviou heartbeat',
  },
  inactive: {
    label: 'Inativo',
    labelEn: 'Inactive',
    color: 'muted',
    icon: 'inactive',
    description: 'Agente marcado como inativo no sistema',
  },
};

import { AGENT_STATUS_THRESHOLDS } from '@/lib/agent-status-constants';

/**
 * Derives detailed agent status from agent data
 * Usa thresholds centralizados de AGENT_STATUS_THRESHOLDS
 */
export function getDetailedAgentStatus(agent: {
  status: string;
  last_heartbeat: string | null;
  offline_reason?: string | null;
}): DetailedAgentStatus {
  // Check inactive first
  if (agent.status === 'inactive') {
    return 'inactive';
  }

  // Never connected
  if (!agent.last_heartbeat) {
    return 'never_connected';
  }

  const lastHeartbeat = new Date(agent.last_heartbeat);
  const now = new Date();
  const minutesSinceHeartbeat = (now.getTime() - lastHeartbeat.getTime()) / 1000 / 60;

  // Online (less than ONLINE_MAX_MINUTES)
  if (minutesSinceHeartbeat < AGENT_STATUS_THRESHOLDS.ONLINE_MAX_MINUTES) {
    return 'online';
  }

  // Stale heartbeat (between ONLINE and OFFLINE thresholds)
  if (minutesSinceHeartbeat < AGENT_STATUS_THRESHOLDS.OFFLINE_MIN_MINUTES) {
    return 'stale_heartbeat';
  }

  // Offline - check reason (after OFFLINE_MIN_MINUTES)
  const offlineReason = agent.offline_reason as OfflineReason | undefined;
  
  switch (offlineReason) {
    case 'shutdown':
      return 'offline_shutdown';
    case 'network_unreachable':
      return 'offline_network';
    case 'agent_crash':
      return 'offline_crash';
    case 'version_incompatible':
      return 'offline_version';
    default:
      return 'offline_unknown';
  }
}

/**
 * Get status badge configuration for an agent
 */
export function getAgentStatusBadge(status: DetailedAgentStatus): {
  label: string;
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
  className: string;
} {
  const config = AGENT_STATUS_CONFIG[status];
  
  const variantMap: Record<AgentStatusConfig['color'], 'default' | 'secondary' | 'destructive' | 'outline'> = {
    success: 'default',
    warning: 'secondary',
    error: 'destructive',
    muted: 'outline',
    info: 'secondary',
  };

  const classMap: Record<AgentStatusConfig['color'], string> = {
    success: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    warning: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    error: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    muted: 'bg-muted text-muted-foreground',
    info: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  };

  return {
    label: config.label,
    variant: variantMap[config.color],
    className: classMap[config.color],
  };
}
