export interface AIInsight {
  id: string;
  tenant_id: string;
  agent_id: string | null;
  insight_type: string;
  severity: string;
  title: string;
  description: string;
  evidence: Record<string, unknown>;
  recommendation: string;
  confidence_score: number;
  auto_action_mode: 'none' | 'suggest' | 'auto' | 'auto_with_approval';
  category: string | null;
  recommended_actions: Record<string, unknown>[];
}
