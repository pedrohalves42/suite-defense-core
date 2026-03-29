/**
 * Shared types for action-center-feed
 */

export interface ActionItem {
  item_id: string;
  source_type: 'playbook' | 'alert' | 'agent_offline' | 'ai_insight';
  agent_id: string | null;
  agent_name: string | null;
  hostname: string | null;
  title: string;
  description: string | null;
  severity: string;
  risk_score: number | null;
  context: Record<string, unknown>;
  created_at: string;
  trigger_type: string;
  playbook_id: string | null;
  priority_score: number;
  is_historical?: boolean;
}

export interface ActionCenterFeed {
  urgent: ActionItem[];
  recommended: ActionItem[];
  informational: ActionItem[];
  healthy_count: number;
  offline_count: number;
  total_agents: number;
  generated_at: string;
  warning?: string;
}
