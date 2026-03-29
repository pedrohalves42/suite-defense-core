/**
 * Shared types for autonomous-safe-mode rule engine
 */

export interface RuleResult {
  rule_code: string;
  processed_count: number;
  agents: Array<{
    agent_id: string;
    agent_name: string;
    action: string;
    reason: string;
  }>;
}

export interface EngineResult {
  success: boolean;
  rules_evaluated: number;
  total_actions: number;
  results: RuleResult[];
  executed_at: string;
}

export interface ActionExecuted {
  type: string;
  success: boolean;
  id?: string;
  error?: string;
}

export type SupabaseClient = ReturnType<typeof import('https://esm.sh/@supabase/supabase-js@2.74.0').createClient>;
export type RuleRecord = Record<string, unknown> & {
  code: string;
  definition?: {
    conditions?: Record<string, unknown>;
    parameters?: Record<string, unknown>;
  };
};
