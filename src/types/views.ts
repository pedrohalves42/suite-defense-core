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
