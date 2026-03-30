export type { RuleType, RuleAction, SecurityPolicy } from '@/types/security-policies';

export interface AgentGroupWithCount {
  id: string;
  name: string;
  description: string | null;
  tenant_id: string;
  created_at: string;
  updated_at: string;
  memberCount: number;
}

export interface PolicyImpact {
  groups: number;
  agents: number;
}
