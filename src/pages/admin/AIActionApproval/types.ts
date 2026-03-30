export interface AIAction {
  id: string;
  insight_id: string;
  tenant_id: string;
  action_type: string;
  action_payload: any;
  status: string;
  created_at: string;
  risk_level?: string;
  ai_insights?: {
    title: string;
    description: string;
    severity: string;
    confidence_score: number;
    evidence: any;
  };
  ai_action_executions?: Array<{
    execution_status: string;
    execution_result: any;
    error_message: string;
    executed_at: string;
  }>;
}

export interface ActionConfig {
  action_type: string;
  description: string;
  risk_level: string;
  max_executions_per_day: number;
}

export interface AIInsight {
  id: string;
  title: string;
  description: string;
  severity: string;
  recommendation: string | null;
  confidence_score: number | null;
  created_at: string;
  acknowledged: boolean;
}
