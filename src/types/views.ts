/**
 * Manual type definitions for database views that are not fully 
 * represented in the auto-generated Supabase types, or cause 
 * TS2589 (type instantiation too deep) errors.
 * 
 * These types eliminate `as any` casts in hooks that query views.
 */

import type { Json } from '@/integrations/supabase/types';

// ─── v_incident_groups ─────────────────────────────────────

export interface VIncidentGroupRow {
  id: string | null;
  fingerprint_hash: string | null;
  source_type: string | null;
  failure_class: string | null;
  normalized_signature: Json | null;
  severity_hint: string | null;
  total_occurrences: number | null;
  distinct_agents: number | null;
  distinct_tenants: number | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
  is_active: boolean | null;
  is_ongoing: boolean | null;
  is_trending: boolean | null;
  occurrences_24h: number | null;
  tenant_id?: string;
}

// ─── insight_feedback_quality ──────────────────────────────

export interface InsightFeedbackQualityRow {
  tenant_id: string;
  insight_type: string | null;
  total_feedback: number | null;
  useful_count: number | null;
  noise_count: number | null;
  false_positive_count: number | null;
  quality_score: number | null;
  last_feedback_at: string | null;
}

// ─── v_tenant_claim_health ─────────────────────────────────

export interface VTenantClaimHealthRow {
  total_valid_24h: number;
  total_missing_24h: number;
  total_switches_24h: number;
  total_cross_tenant_24h: number;
  last_period: string | null;
}

// ─── v_agent_lifecycle_state ───────────────────────────────

export interface VAgentLifecycleStateRow {
  id: string;
  agent_id: string;
  agent_name: string;
  hostname: string | null;
  os_type: string | null;
  status: string;
  agent_version: string | null;
  last_heartbeat: string | null;
  enrolled_at: string | null;
  tenant_id: string;
  is_archived: boolean | null;
  display_name: string | null;
  is_isolated: boolean | null;
  lifecycle_state: string | null;
  days_since_heartbeat: number | null;
  days_since_enrolled: number | null;
}

// ─── v_agent_state ─────────────────────────────────────────

export interface VAgentStateRow {
  id: string;
  agent_id: string;
  agent_name: string;
  hostname: string | null;
  os_type: string | null;
  status: string;
  agent_version: string | null;
  last_heartbeat: string | null;
  enrolled_at: string | null;
  tenant_id: string;
  is_archived: boolean | null;
  display_name: string | null;
  is_isolated: boolean | null;
}

// ─── v_problematic_agents ──────────────────────────────────

export interface VProblematicAgentRow {
  id: string;
  agent_name: string;
  hostname: string | null;
  status: string;
  agent_version: string | null;
  last_heartbeat: string | null;
  tenant_id: string;
  problem_type: string | null;
  problem_severity: string | null;
}

// ─── v_system_operations_summary ───────────────────────────

export interface VSystemOperationsSummaryRow {
  tenant_id: string;
  total_agents: number | null;
  online_agents: number | null;
  total_jobs_24h: number | null;
  failed_jobs_24h: number | null;
  completed_jobs_24h: number | null;
}

// ─── v_job_metrics_by_type ─────────────────────────────────

export interface VJobMetricsByTypeRow {
  job_type: string;
  total_count: number | null;
  success_count: number | null;
  failure_count: number | null;
  avg_duration_ms: number | null;
  success_rate: number | null;
}

// ─── SecurityEvent (for typed event_data access) ───────────

export interface SecurityEventData {
  alert_type?: string;
  alert_message?: string;
  severity?: string;
  state_before?: string;
  state_after?: string;
  details?: Record<string, unknown>;
  skip_remediation?: boolean;
  [key: string]: unknown;
}

// ─── AI Insight with status ────────────────────────────────

export interface AIInsightRow {
  id: string;
  tenant_id: string;
  insight_type: string;
  title: string;
  description: string | null;
  severity: string | null;
  status: 'open' | 'resolved' | 'rejected';
  created_at: string;
  metadata: Record<string, unknown> | null;
}
