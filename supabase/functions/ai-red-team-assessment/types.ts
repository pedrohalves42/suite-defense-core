export interface RedTeamAssessmentResult {
  threat_level: string;
  red_score: number;
  attack_vectors: string[];
  residual_risks: string[];
  dimension_threats: Record<string, string>;
  executive_threat_summary: string;
  worst_case_scenario: string;
  recommended_hardening: string[];
}

export interface DeterministicCriteria {
  offline_agents_exist: boolean;
  human_approval_rate_zero: boolean;
  human_reviewed_zero: boolean;
  rollback_never_tested: boolean;
  single_user_system: boolean;
  dlq_has_items: boolean;
  critical_alerts_open: boolean;
}
