/**
 * Types for evaluate-playbook-triggers
 */

export interface TriggerEvent {
  tenant_id: string;
  trigger_type:
    | 'agent_offline'
    | 'dns_blocked'
    | 'job_failed'
    | 'integrity_low'
    | 'manual'
    | 'suspicious_web_activity'
    | 'vulnerability_critical'
    | 'vulnerability_high'
    | 'multiple_malicious_access'
    | 'suspicious_process'
    | 'unauthorized_service';
  agent_id?: string;
  context?: Record<string, unknown>;
}

export interface PlaybookAction {
  id: string;
  order_index: number;
  action_type: string;
  label: string;
  description: string;
  action_payload: Record<string, unknown>;
  risk_level: string;
}

export interface RiskAnalysis {
  risk_score: number;
  threshold: number;
  should_auto_execute: boolean;
  has_destructive_actions: boolean;
  require_approval: boolean;
  is_enabled: boolean;
  decision_reason: string;
}

export interface TenantSettings {
  enable_dry_run_mode: boolean;
}
