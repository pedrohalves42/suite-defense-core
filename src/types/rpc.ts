/**
 * Type definitions for RPC function return types that are not
 * auto-generated in the Supabase types file.
 * 
 * These eliminate `as any` casts in hooks/components that call RPCs.
 */

/** Return type for `get_agents_list` RPC */
export interface RpcAgentRow {
  id: string;
  agent_name: string;
  agent_version: string | null;
  status: string;
  hostname: string | null;
  os_type: string | null;
  last_heartbeat: string | null;
  enrolled_at: string | null;
  tenant_id: string;
  force_update_version: string | null;
  force_update_delivered_count: number | null;
  is_archived: boolean | null;
}

/** Realtime payload for virus_scans INSERT */
export interface RealtimeVirusScan {
  id: string;
  agent_name: string;
  file_path: string;
  file_hash: string;
  is_malicious: boolean | null;
  positives: number | null;
  total_scans: number | null;
  scanned_at: string;
  tenant_id: string;
  virustotal_permalink: string | null;
}

/** Realtime payload for jobs UPDATE */
export interface RealtimeJob {
  id: string;
  agent_name: string;
  type: string;
  status: string;
  tenant_id: string;
}

/** Subscription with extended billing fields */
export interface SubscriptionWithBilling {
  id: string;
  tenant_id: string;
  plan_id: string | null;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  billing_period?: string | null;
  discount_pct?: number | null;
  subscription_plans?: {
    name: string;
    max_users: number;
    max_agents: number | null;
  } | null;
}
