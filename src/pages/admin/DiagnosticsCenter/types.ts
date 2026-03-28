import type { RpcAgentRow } from '@/types/rpc';

export interface ProblematicAgent {
  id: string;
  agent_name: string;
  tenant_id: string;
  status: string | null;
  enrolled_at: string | null;
  last_heartbeat: string | null;
  hostname: string | null;
  os_type: string | null;
  issue_type: string | null;
  has_active_token: boolean | null;
  failed_jobs_24h?: number | null;
  is_throttled?: boolean | null;
  is_isolated?: boolean | null;
  is_in_safe_mode?: boolean | null;
}

export interface ProblemCounts {
  total: number;
  noHeartbeat: number;
  noToken: number;
  failedJobs: number;
  criticalCount: number;
}

export interface IssueInfo {
  label: string;
  variant: 'destructive' | 'warning' | 'secondary';
  icon: React.ComponentType<{ className?: string }>;
}
