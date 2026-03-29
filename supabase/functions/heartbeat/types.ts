/**
 * Shared types for heartbeat modules.
 * Single source of truth for all heartbeat-related interfaces.
 */

export interface OSInfo {
  os_type?: string;
  platform?: string; // Legacy field
  os_version?: string;
  hostname?: string;
  agent_version?: string;
  ed25519_supported?: boolean;
  signature_mode?: string;
  system_metrics?: SystemMetricsPayload;
  processes?: ProcessesPayload;
  process_anomalies?: unknown[];
}

export interface SystemMetricsPayload {
  error?: string;
  cpu_percent?: number;
  cpu_name?: string;
  cpu_cores?: number;
  memory_total_gb?: number;
  memory_used_gb?: number;
  memory_free_gb?: number;
  memory_used_percent?: number;
  disk_total_gb?: number;
  disk_free_gb?: number;
  disk_used_percent?: number;
  uptime_seconds?: number;
}

export interface ProcessesPayload {
  error?: string;
  top_by_cpu?: ProcessEntry[];
  top_by_memory?: ProcessEntry[];
  total_processes?: number;
}

export interface ProcessEntry {
  pid?: number;
  name?: string;
  cpu_seconds?: number;
  memory_mb?: number;
  user?: string;
  command_line?: string;
}

export interface AgentContext {
  id: string;
  agent_name: string;
  hmac_secret: string;
  tenant_id: string;
  status: string;
  skip_firewall_remediation: boolean;
  agent_version: string | null;
  force_update_version: string | null;
  force_update_reason: string | null;
  force_update_at: string | null;
  force_update_override_safe_mode: boolean;
  force_update_override_safe_mode_expires_at: string | null;
  force_update_delivered_count: number;
  force_update_first_delivered_at: string | null;
  last_forced_update_applied: string | null;
}

export interface AgentUpdate {
  last_heartbeat: string;
  status: string;
  os_type?: string;
  os_version?: string;
  hostname?: string;
  agent_version?: string;
  ed25519_supported?: boolean;
  signature_mode?: string;
}

export interface HeartbeatContext {
  supabase: import('https://esm.sh/@supabase/supabase-js@2.74.0').SupabaseClient;
  agent: AgentContext;
  osInfo: OSInfo;
  updateData: AgentUpdate;
  origin: string | null;
  platform: string;
}
