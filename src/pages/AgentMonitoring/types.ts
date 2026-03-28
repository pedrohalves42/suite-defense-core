export interface Agent {
  id: string;
  agent_name: string;
  status: string;
  last_heartbeat: string | null;
  enrolled_at: string;
  agent_state?: string;
}

export interface Job {
  id: string;
  type: string;
  status: string;
  agent_name: string;
  created_at: string;
  completed_at: string | null;
}

export interface UptimeDataPoint {
  name: string;
  uptime: number;
}

export interface ScansTrendPoint {
  date: string;
  total: number;
  malicious: number;
  clean: number;
}

export interface JobsTrendPoint {
  date: string;
  total: number;
  completed: number;
  failed: number;
  pending: number;
}

export type GlobalStatus = 'healthy' | 'warning' | 'critical';
