export interface AgentMetrics {
  id: string;
  name: string;
  os_type: 'windows' | 'linux' | 'macos' | 'unknown';
  os_version?: string;
  hostname?: string;
  status: string;
  last_heartbeat: string;
  is_online: boolean;
  cpu_usage: number | null;
  memory_usage: number | null;
  disk_usage: number | null;
  uptime_hours: number | null;
  metrics_age_minutes: number | null;
  agent_version?: string;
}

export interface DashboardSummary {
  total_agents: number;
  online_agents: number;
  offline_agents: number;
  windows_agents: number;
  linux_agents: number;
  avg_cpu_usage: string | null;
  avg_memory_usage: string | null;
  avg_disk_usage: string | null;
  critical_alerts: number;
  high_alerts: number;
}

export interface SystemAlert {
  id: string;
  alert_type: string;
  severity: string;
  title: string;
  message: string;
  created_at: string;
  acknowledged: boolean;
  agent_id: string | null;
  details?: {
    disk_usage?: number;
    memory_usage?: number;
    cpu_usage?: number;
    [key: string]: any;
  };
}

export interface GroupedAlert extends SystemAlert {
  count: number;
  latestValue: number | null;
  groupKey: string;
}

export interface SilentProblem {
  icon: string;
  text: string;
  severity: string;
  agents: string[];
}
