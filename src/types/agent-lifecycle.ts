// ========================================
// ORION DATAFLOW: Agent Lifecycle Types
// Purpose: Unified data contracts for agent state management
// ========================================

export type LifecycleStage = 
  | 'unknown'
  | 'generated'
  | 'downloaded'
  | 'installing'
  | 'installed_offline'
  | 'active';

export interface AgentLifecycleState {
  agent_id: string;
  agent_name: string;
  tenant_id: string;
  agent_status: string;
  enrolled_at: string;
  last_heartbeat: string | null;
  os_type: string | null;
  os_version: string | null;
  hostname: string | null;
  
  // Installation stages timestamps
  generated_at: string | null;
  downloaded_at: string | null;
  command_copied_at: string | null;
  installed_at: string | null;
  
  // Current lifecycle stage
  lifecycle_stage: LifecycleStage;
  
  // Installation metrics
  installation_time_seconds: number | null;
  installation_success: boolean | null;
  network_connectivity: boolean | null;
  
  // Error tracking
  last_error_message: string | null;
  last_error_at: string | null;
  
  // Platform and method
  platform: string | null;
  installation_method: string | null;
  
  // Metadata
  installation_metadata: Record<string, any> | null;
  
  // Time calculations
  minutes_since_heartbeat: number | null;
  minutes_since_enrollment: number | null;
  minutes_between_copy_and_install: number | null;
  
  // Stuck detection
  is_stuck: boolean;
}

export interface InstallationTelemetryPayload {
  agent_token: string;
  agent_name: string;
  success: boolean;
  platform: 'windows' | 'linux';
  installation_time_seconds: number;
  installation_method: 'powershell' | 'bash';
  
  // Network tests
  network_tests?: {
    health_check_passed: boolean;
    heartbeat_endpoint_ok: boolean;
    telemetry_endpoint_ok: boolean;
    proxy_detected: boolean;
    tls_version: string;
  };
  
  // Installation logs (stdout/stderr)
  installation_logs?: {
    stdout: string[];
    stderr: string[];
  };
  
  // Error details (when success = false)
  error_type?: '401_unauthorized' | 'tls_error' | 'proxy_error' | 'script_error' | 'network_timeout' | 'unknown';
  error_message?: string;
  error_details?: Record<string, any>;
  
  // System info
  system_info?: {
    os_version: string;
    powershell_version: string;
    dotnet_version?: string;
    hostname: string;
    admin_privileges: boolean;
  };
}

export interface DashboardAgentCard {
  agent_id: string;
  agent_name: string;
  lifecycle_stage: LifecycleStage;
  status_badge: {
    label: string;
    color: 'success' | 'warning' | 'error' | 'info';
  };
  
  // Visual timeline (for UI display)
  timeline: {
    generated: boolean;
    downloaded: boolean;
    command_copied: boolean;
    installed: boolean;
    active: boolean;
  };
  
  // Quick metrics
  metrics: {
    uptime_minutes: number | null;
    install_time_seconds: number | null;
    last_seen: string | null;
  };
  
  // Flags for quick filtering
  flags: {
    is_stuck: boolean;
    has_errors: boolean;
    is_offline: boolean;
  };
  
  // Available actions
  actions: {
    can_retry_install: boolean;
    can_view_logs: boolean;
    can_delete: boolean;
  };
}

export interface PipelineMetrics {
  total_generated: number;
  total_downloaded: number;
  total_command_copied: number;
  total_installed: number;
  total_active: number;
  total_stuck: number;
  success_rate_pct: number;
  avg_install_time_seconds: number;
  conversion_rate_generated_to_installed_pct: number;
  conversion_rate_copied_to_installed_pct: number;
}

export interface InstallationLogEntry {
  id: string;
  created_at: string;
  agent_id: string | null;
  agent_name: string;
  tenant_id: string;
  event_type: string;
  platform: string;
  success: boolean | null;
  error_message: string | null;
  installation_time_seconds: number | null;
  network_connectivity: boolean | null;
  metadata: Record<string, any> | null;
}
