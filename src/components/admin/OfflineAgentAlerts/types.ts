export interface OfflineAgent {
  agent_id: string;
  agent_name: string;
  last_heartbeat: string;
  offline_hours: number;
  hostname: string | null;
  os_type: string | null;
}

export interface BusinessHours {
  enabled: boolean;
  timezone: string;
  days: number[];
  start: string;
  end: string;
}

export type SeverityLevel = 'warning' | 'danger' | 'critical' | 'info';
