/**
 * Shared types for submit-job-result modules
 */

export interface AuthenticatedAgentInfo {
  id: string;
  agent_name: string;
  tenant_id: string;
  hmac_secret: string;
}

export interface JobRecord {
  id: string;
  agent_name: string;
  tenant_id: string;
  status: string;
  type: string;
  agent_id: string;
  payload_hash: string | null;
  created_at: string;
}

export interface ParsedPayload {
  job_id: string;
  status: 'completed' | 'failed';
  output: unknown;
  error_message: string | null;
  execution_time_seconds: number | null;
  started_at: string | null;
  finished_at: string | null;
  execution_id: string | null;
  raw_execution_id: string | null;
  nonce: string | null;
  result_signature: string | null;
  signature_algorithm: string | null;
  execution_hash: string | null;
  previous_execution_hash: string | null;
  execution_index: number | null;
}

export interface SideEffectAccumulator {
  inserted: boolean;
  recordCount: number;
}

export interface SubmitContext {
  supabase: import('https://esm.sh/@supabase/supabase-js@2.74.0').SupabaseClient;
  agent: AuthenticatedAgentInfo;
  agentVersion: string;
  job: JobRecord;
  payload: ParsedPayload;
  outputData: Record<string, unknown>;
  ipAddress: string;
  sideEffects: SideEffectAccumulator;
}
