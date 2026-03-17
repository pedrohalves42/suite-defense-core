/**
 * Dashboard type definitions.
 * Canonical source for all dashboard-related types.
 */

export interface DashboardAgent {
  id: string;
  agent_name: string;
  status: string;
  enrolled_at: string;
  last_heartbeat: string | null;
  tenant_id: string;
}

export interface DashboardJob {
  id: string;
  agent_name: string;
  type: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  error_message?: string | null;
  failure_class?: string | null;
}

export interface DashboardReport {
  id: string;
  agent_name: string;
  kind: string;
  file_path: string;
  created_at: string;
}

export interface DashboardAgentToken {
  id: string;
  agent_id: string;
  token_hash: string;
  token_prefix: string;
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  is_active: boolean;
  agents?: { agent_name: string } | null;
}

export interface DashboardRateLimit {
  id: string;
  identifier: string;
  endpoint: string;
  request_count: number;
  window_start: string;
  last_request_at: string;
  blocked_until: string | null;
}

export interface DashboardVirusScan {
  id: string;
  agent_name: string;
  file_path: string;
  file_hash: string;
  is_malicious: boolean | null;
  positives: number | null;
  total_scans: number | null;
  scanned_at: string;
}

export interface DashboardAuditLog {
  id: string;
  action: string;
  resource_type: string;
  created_at: string;
  success: boolean;
  user_id: string | null;
}
