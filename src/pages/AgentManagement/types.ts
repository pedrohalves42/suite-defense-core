export interface Agent {
  id: string;
  agent_name: string;
  status: string;
  enrolled_at: string;
  last_heartbeat: string | null;
  tenant_id: string;
  os_type: string | null;
  os_version: string | null;
  hostname: string | null;
  agent_version: string | null;
}

export type StatusFilter = 'all' | 'online' | 'offline' | 'pending' | 'disabled';
export type VersionFilter = 'all' | 'outdated' | 'current';

export interface AgentMetrics {
  agent_id: string;
  cpu_usage_percent: number | null;
  memory_usage_percent: number | null;
  disk_usage_percent: number | null;
}

export interface AgentStats {
  total: number;
  online: number;
  offline: number;
  pending: number;
  disabled: number;
  outdated: number;
}
