export interface AgentErrorContext {
  agent_id: string;
  agent_name: string;
  agent_version: string;
  error_type: string;
  error_message: string;
  error_stack?: string;
  system_snapshot: {
    cpu_percent?: number;
    memory_percent?: number;
    disk_percent?: number;
    uptime_hours?: number;
    os_version?: string;
    network_status?: string;
    recent_events?: string[];
  };
  recent_errors?: Array<{
    timestamp: string;
    type: string;
    message: string;
  }>;
}

export interface RemediationAction {
  action: 'restart_service' | 'clear_cache' | 'free_disk_space' | 'restart_agent' |
    'check_network' | 'update_agent' | 'escalate' | 'ignore' | 'adjust_config';
  priority: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  auto_executable: boolean;
  parameters?: Record<string, unknown>;
  estimated_impact: string;
}

export interface DiagnosisResult {
  diagnosis: string;
  root_cause: string;
  confidence: number;
  actions: RemediationAction[];
  requires_human_review: boolean;
  similar_past_incidents?: string;
}
