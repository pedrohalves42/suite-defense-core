export interface Agent {
  id: string;
  agent_name: string;
  status: string;
}

export interface RiskClassification {
  level: string;
  color: string;
  description: string;
}

export interface UnprotectedPCs {
  no_antivirus: number;
  outdated_av: number;
  offline_agents: number;
  agents_without_av?: Array<{ agent_name: string; hostname: string; last_heartbeat: string }>;
}

export interface Recommendation {
  priority: number;
  category: string;
  title: string;
  description: string;
}

export interface SecurityReport {
  success?: boolean;
  generated_at: string;
  tenant_id: string;
  agent_filter: string;
  risk_score?: number;
  risk_classification?: RiskClassification;
  unprotected_pcs?: UnprotectedPCs;
  recommendations?: Recommendation[];
  statistics: {
    total_agents: number;
    total_software: number;
    total_vulnerabilities: number;
    critical_vulnerabilities: number;
    high_vulnerabilities: number;
    medium_vulnerabilities?: number;
    low_vulnerabilities?: number;
    antivirus_engines: number;
    threats_found: number;
    unique_domains: number;
    malicious_scans: number;
    total_scans: number;
    security_events: number;
    failed_login_attempts_24h?: number;
  };
  data?: {
    agents: unknown[];
    software_inventory: Array<Record<string, unknown>>;
    vulnerabilities: Array<Record<string, unknown>>;
    antivirus_status: Array<Record<string, unknown>>;
    web_activity: Array<Record<string, unknown>>;
    virus_scans: unknown[];
    security_events: unknown[];
    failed_login_attempts?: Array<Record<string, unknown>>;
  };
}
