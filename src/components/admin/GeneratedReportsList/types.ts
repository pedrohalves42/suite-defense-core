export interface GeneratedReport {
  id: string;
  tenant_id: string;
  agent_id: string | null;
  agent_name: string | null;
  report_type: string;
  title: string;
  risk_score: number | null;
  risk_level: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  statistics: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  report_data: Record<string, any>;
  status: string;
  triggered_by: string;
  created_at: string;
  expires_at: string;
  sales_status: string | null;
  commercial_priority: string | null;
  next_action: string | null;
  commercial_summary: string | null;
  contacted_at: string | null;
  follow_up_at: string | null;
}
