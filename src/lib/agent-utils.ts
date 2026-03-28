// Utility functions for agent display names and formatting
import { getAgentOnlineStatus } from './agent-status-constants';

/**
 * Get a user-friendly display name for an agent
 * Priority: display_name > hostname > cleaned agent_name
 */
export function getAgentDisplayName(agent: {
  display_name?: string | null;
  hostname?: string | null;
  agent_name?: string;
}): string {
  // SEMPRE retornar agent_name exatamente como definido na instalação
  if (agent.agent_name) {
    return agent.agent_name;
  }
  
  // Fallbacks apenas se agent_name não existir
  if (agent.display_name) {
    return agent.display_name;
  }
  
  return 'Computador Desconhecido';
}

/**
 * Get status display info for agent
 * Usa cálculo centralizado de status
 */
export function getAgentStatusInfo(agent: {
  status?: string;
  last_heartbeat?: string | null;
  agent_state?: string | null;
}): {
  label: string;
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
  isOnline: boolean;
} {
  const calculatedStatus = getAgentOnlineStatus({
    status: agent.status,
    last_heartbeat: agent.last_heartbeat,
    agent_state: agent.agent_state ?? undefined,
  });

  if (calculatedStatus === 'online') {
    return { label: 'Online', variant: 'default', isOnline: true };
  }

  if (calculatedStatus === 'warning') {
    return { label: 'Atenção', variant: 'secondary', isOnline: true };
  }

  if (calculatedStatus === 'never_connected') {
    return { label: 'Nunca Conectou', variant: 'outline', isOnline: false };
  }

  return { label: 'Offline', variant: 'destructive', isOnline: false };
}

/**
 * Format job type to friendly name
 */
export function getJobTypeName(jobType: string): string {
  const names: Record<string, string> = {
    software_inventory_collect: 'Inventário de Software',
    light_vuln_scan: 'Análise de Vulnerabilidades',
    collect_antivirus_status: 'Status do Antivírus',
    collect_web_activity: 'Atividade Web',
    collect_network_info: 'Informações de Rede',
    fix_firewall: 'Correção de Firewall',
    update_agent: 'Atualizar Programa',
    restart_service: 'Reiniciar Serviço',
    scan_file: 'Escanear Arquivo',
    reinstall_agent: 'Reinstalar Programa',
  };
  
  return names[jobType] || jobType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Get default payload for job type
 */
export function getDefaultJobPayload(jobType: string): any {
  const payloads: Record<string, Record<string, unknown>> = {
    software_inventory_collect: { include_32bit: true, include_updates: true },
    light_vuln_scan: { scan_depth: 'standard', include_cve_check: true },
    collect_antivirus_status: { check_definitions: true },
    collect_web_activity: { browsers: ['chrome', 'firefox', 'edge'], days_back: 7 },
    collect_network_info: { include_open_ports: true, include_active_connections: true },
    fix_firewall: { enable_public: true, enable_private: true, enable_domain: true },
    update_agent: { force: false },
    restart_service: { service_name: 'CyberShieldAgent' },
  };
  
  return payloads[jobType] || {};
}

/**
 * Format relative time in Portuguese
 */
export function formatRelativeTimePt(date: Date | string | null): string {
  if (!date) return 'Nunca';
  
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffSeconds < 60) return 'Agora mesmo';
  if (diffMinutes < 60) return `${diffMinutes} min atrás`;
  if (diffHours < 24) return `${diffHours}h atrás`;
  if (diffDays < 7) return `${diffDays} dias atrás`;
  
  return then.toLocaleDateString('pt-BR', { 
    day: '2-digit', 
    month: 'short' 
  });
}
