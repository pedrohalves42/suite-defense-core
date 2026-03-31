export interface IntegrityResult {
  valid: boolean;
  sha256_match?: boolean;
  hmac_valid?: boolean;
  algorithm?: string;
}

export interface ExecutiveSummary {
  title: string;
  overallStatus: string;
  overallMessage: string;
  highlights: Array<{
    icon: string;
    label: string;
    value: string;
    status: string;
  }>;
  recommendations: string[];
}

export interface Invariant {
  id: string;
  name: string;
  technicalName?: string;
  status: string;
  description: string;
  laymanDescription?: string;
  details: string;
  laymanDetails?: string;
  evidence_hash: string;
}

export interface Statistics {
  total_agents?: number;
  online_agents?: number;
  offline_agents?: number;
  total_vulnerabilities?: number;
  critical_vulnerabilities?: number;
  high_vulnerabilities?: number;
  medium_vulnerabilities?: number;
  low_vulnerabilities?: number;
  threats_found?: number;
  agents_with_av?: number;
  agents_with_active_av?: number;
  av_outdated?: number;
  security_events?: number;
  failed_logins?: number;
  blocked_sites?: number;
  blocked_access_attempts?: number;
  job_success_rate?: number;
}

export interface ReportInfo {
  title: string;
  report_type: string;
  risk_score: number | null;
  risk_level: string | null;
  risk_trend?: string;
  risk_layman_description?: string;
  status: string;
  created_at: string;
  expires_at: string | null;
  is_expired: boolean;
  tenant_name: string;
  template?: string;
  template_name?: string;
  template_description?: string;
  period_start?: string;
  period_end?: string;
  statistics?: Statistics;
  executive_summary?: ExecutiveSummary;
  invariants?: Invariant[];
  invariants_summary?: {
    total: number;
    passed: number;
    failed: number;
    warning?: number;
  };
}

export interface HashInfo {
  sha256?: string;
  sha256_preview?: string;
}

export interface VerificationResponse {
  success: boolean;
  error?: string;
  audit_id?: string;
  report_id?: string;
  integrity: IntegrityResult;
  report?: ReportInfo;
  hashes?: HashInfo;
  verification?: {
    verified_at: string;
    verification_method: string;
    compliance_standards: string[];
  };
}
