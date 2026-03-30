export interface TenantSettings {
  id: string;
  tenant_id: string;
  alert_email: string | null;
  alert_webhook_url: string | null;
  alert_threshold_virus_positive: number;
  alert_threshold_failed_jobs: number;
  alert_threshold_offline_agents: number;
  virustotal_enabled: boolean;
  stripe_enabled: boolean;
  enable_email_alerts: boolean;
  enable_webhook_alerts: boolean;
  enable_auto_quarantine: boolean;
  enable_dry_run_mode: boolean;
}

export interface IntegrationTestResult {
  success: boolean;
  message: string;
  details?: unknown;
}
