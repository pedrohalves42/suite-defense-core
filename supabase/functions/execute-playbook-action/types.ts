import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

export interface PlaybookAction {
  id: string;
  order_index: number;
  action_type: string;
  label: string;
  description: string;
  action_payload: Record<string, unknown>;
  risk_level: string;
}

export interface ExecuteRequest {
  execution_id: string;
  action_index?: number;
  notes?: string;
}

export interface ActionResult {
  action_id: string;
  action_type: string;
  label: string;
  success: boolean;
  result?: Record<string, unknown>;
  error?: string;
  executed_at: string;
}

export interface ActionContext {
  supabase: SupabaseClient;
  tenantId: string;
  agentId: string | null;
  userId: string;
  executionId: string;
  playbookSnapshot: Record<string, unknown>;
  triggerContext: Record<string, unknown>;
}
