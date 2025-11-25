/**
 * Types for Security Features v3.10.0
 */

export type RiskLevel = 'unknown' | 'low' | 'medium' | 'high' | 'critical';
export type Severity = 'low' | 'medium' | 'high' | 'critical';
export type Reputation = 'unknown' | 'clean' | 'suspicious' | 'malicious';

export interface SoftwareItem {
  id: string;
  tenant_id: string;
  agent_id: string;
  name: string;
  version?: string | null;
  vendor?: string | null;
  install_location?: string | null;
  risk_level: string;
  first_seen_at: string;
  last_seen_at: string;
}

export interface VulnFinding {
  id: string;
  tenant_id: string;
  agent_id: string;
  severity: string;
  check_key: string;
  title: string;
  description?: string | null;
  remediation?: string | null;
  first_seen_at: string;
  last_seen_at: string;
  acknowledged_at?: string | null;
}

export interface AntivirusStatus {
  id: string;
  tenant_id: string;
  agent_id: string;
  engine_name: string;
  engine_version?: string | null;
  status?: string | null;
  last_update_at?: string | null;
  last_scan_at?: string | null;
  threats_found?: number | null;
  raw_data?: unknown;
  collected_at: string;
}

export interface WebActivityItem {
  domain: string;
  first_seen_at: string;
  last_seen_at: string;
  hits: number;
}

export interface WebActivityRaw {
  id: string;
  tenant_id: string;
  agent_id: string;
  domain: string;
  url?: string;
  source: string;
  visited_at: string;
  created_at: string;
}

export interface UrlReputationItem {
  id: string;
  tenant_id: string;
  url: string;
  domain?: string;
  reputation: Reputation;
  score?: number;
  category?: string;
  last_checked_at: string;
  details?: Record<string, unknown>;
}

export interface AgentTimelineEvent {
  tenant_id: string;
  agent_id: string;
  source_id: string;
  event_type: string;
  event_key: string;
  event_time: string;
  data: unknown;
}

export interface SecurityEvent {
  id: string;
  tenant_id: string;
  agent_id?: string;
  policy_id?: string;
  rule_id?: string;
  severity: Severity;
  title: string;
  description?: string;
  status: 'open' | 'acknowledged' | 'closed';
  data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface AnomalyEvent {
  id: string;
  tenant_id: string;
  agent_id: string;
  type: string;
  severity: Severity;
  description?: string;
  data: Record<string, unknown>;
  created_at: string;
  acknowledged_at?: string;
}
