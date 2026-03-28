export interface Agent {
  id: string;
  agent_name: string;
  hostname: string | null;
  display_name: string | null;
  status: string;
  last_heartbeat: string | null;
}

export interface Job {
  id: string;
  agent_name: string;
  type: string;
  status: string;
  created_at: string;
  approved: boolean;
  payload: unknown;
  scheduled_at?: string | null;
  is_recurring?: boolean;
  recurrence_pattern?: string | null;
  next_run_at?: string | null;
  last_run_at?: string | null;
}
