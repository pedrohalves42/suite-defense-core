
-- =============================================================================
-- Migration: Close ADR-026 Open Cycles
-- Phase 1: Remove Legacy RLS Policies
-- Phase 2: Create Risk Debt Views
-- =============================================================================

-- ============================================================================
-- PHASE 1: Remove Legacy RLS Policies (co-existing with active_tenant policies)
-- ============================================================================

-- agent_archive_events
DROP POLICY IF EXISTS "Users can view archive events for their tenant agents" ON public.agent_archive_events;

-- agent_disk_metrics
DROP POLICY IF EXISTS "Super admins can view all disk metrics" ON public.agent_disk_metrics;

-- agent_group_policies
DROP POLICY IF EXISTS "Tenant members can view group policies" ON public.agent_group_policies;

-- agent_metrics_daily
DROP POLICY IF EXISTS "Super admins can view all daily metrics" ON public.agent_metrics_daily;

-- agent_network_info
DROP POLICY IF EXISTS "Super admins can view all network info" ON public.agent_network_info;

-- agent_system_metrics
DROP POLICY IF EXISTS "Super admins can view all metrics" ON public.agent_system_metrics;
DROP POLICY IF EXISTS "Users can view metrics in their tenants" ON public.agent_system_metrics;

-- agent_system_metrics partitions
DROP POLICY IF EXISTS "Super admins can view all metrics" ON public.agent_system_metrics_2025_12;
DROP POLICY IF EXISTS "Super admins can view all metrics" ON public.agent_system_metrics_2026_01;
DROP POLICY IF EXISTS "Users can view their tenant metrics" ON public.agent_system_metrics_2026_02;
DROP POLICY IF EXISTS "Super admins can view all metrics" ON public.agent_system_metrics_partitioned;
DROP POLICY IF EXISTS "Users can view partitioned metrics in their tenants" ON public.agent_system_metrics_partitioned;

-- agent_tokens
DROP POLICY IF EXISTS "Super admins can delete agent tokens" ON public.agent_tokens;
DROP POLICY IF EXISTS "Super admins can update agent tokens" ON public.agent_tokens;

-- agent_web_activity
DROP POLICY IF EXISTS "Users can view web activity in their tenant" ON public.agent_web_activity;

-- agents
DROP POLICY IF EXISTS "Super admins can delete agents" ON public.agents;
DROP POLICY IF EXISTS "Super admins can update agents" ON public.agents;
DROP POLICY IF EXISTS "Super admins can view all agents" ON public.agents;

-- agents_groups
DROP POLICY IF EXISTS "Users can view agent group memberships in their tenant" ON public.agents_groups;

-- ai_action_configs
DROP POLICY IF EXISTS "Super admins can manage action configs" ON public.ai_action_configs;

-- ai_action_validations
DROP POLICY IF EXISTS "Users can create validations in their tenant" ON public.ai_action_validations;
DROP POLICY IF EXISTS "Users can view validations in their tenant" ON public.ai_action_validations;

-- ai_anomalies
DROP POLICY IF EXISTS "Users can view anomalies for their tenant" ON public.ai_anomalies;

-- ai_inference_metrics
DROP POLICY IF EXISTS "Super admins can view all AI metrics" ON public.ai_inference_metrics;

-- ai_rejected_decisions
DROP POLICY IF EXISTS "Tenant users can view their rejected decisions" ON public.ai_rejected_decisions;

-- anomaly_events
DROP POLICY IF EXISTS "Users can view anomaly events in their tenant" ON public.anomaly_events;

-- antivirus_status
DROP POLICY IF EXISTS "Users can view antivirus status in their tenant" ON public.antivirus_status;

-- approval_chains
DROP POLICY IF EXISTS "Users can view approval chains in their tenant" ON public.approval_chains;

-- approval_requests
DROP POLICY IF EXISTS "Users can view approval requests in their tenant" ON public.approval_requests;

-- approvals
DROP POLICY IF EXISTS "Users can view approvals in their tenant" ON public.approvals;

-- audit_integrity_checks
DROP POLICY IF EXISTS "Tenant users can view their integrity checks" ON public.audit_integrity_checks;

-- audit_reason_trees
DROP POLICY IF EXISTS "Users can view their tenant reason trees" ON public.audit_reason_trees;

-- blocked_access_attempts
DROP POLICY IF EXISTS "Users can view blocked attempts in their tenant" ON public.blocked_access_attempts;

-- blocked_websites
DROP POLICY IF EXISTS "Users can view blocked websites in their tenant" ON public.blocked_websites;

-- chaos_test_results
DROP POLICY IF EXISTS "Super admins can view chaos test results" ON public.chaos_test_results;

-- custom_trials
DROP POLICY IF EXISTS "Super admins can manage custom trials" ON public.custom_trials;

-- cve_database
DROP POLICY IF EXISTS "Tenant members can view CVE database" ON public.cve_database;

-- decision_events
DROP POLICY IF EXISTS "Super admins can view all decision events" ON public.decision_events;
DROP POLICY IF EXISTS "Users can view decision events in their tenant" ON public.decision_events;

-- decision_rules
DROP POLICY IF EXISTS "Super admins can manage decision rules" ON public.decision_rules;

-- evidence_bundles
DROP POLICY IF EXISTS "Users can view evidence bundles in their tenant" ON public.evidence_bundles;

-- failed_login_attempts
DROP POLICY IF EXISTS "Super admins can view all failed login attempts" ON public.failed_login_attempts;

-- ============================================================================
-- PHASE 2: Create Risk Debt Views (ADR-025 compliance)
-- ============================================================================

-- View for active risk debt items
CREATE OR REPLACE VIEW public.v_risk_debt_active AS
SELECT 
  t.id,
  t.tenant_id,
  t.title,
  t.severity,
  t.closed_at AS accepted_at,
  CASE 
    WHEN t.closure_evidence IS NOT NULL 
      AND t.closure_evidence->>'expiry_date' IS NOT NULL
    THEN (t.closure_evidence->>'expiry_date')::timestamptz
    ELSE NULL
  END AS expires_at,
  t.closure_reason AS justification,
  t.closed_by AS accepted_by
FROM public.tasks t
WHERE t.status = 'accepted_risk'
  AND (
    t.closure_evidence IS NULL 
    OR t.closure_evidence->>'expiry_date' IS NULL
    OR (t.closure_evidence->>'expiry_date')::timestamptz > now()
  );

-- Grant access to authenticated users
GRANT SELECT ON public.v_risk_debt_active TO authenticated;

-- View for risk debt summary per tenant (dashboard widget)
CREATE OR REPLACE VIEW public.v_risk_debt_summary AS
SELECT 
  tenant_id,
  COUNT(*) AS total_active,
  COUNT(*) FILTER (WHERE severity = 'critical') AS critical_count,
  COUNT(*) FILTER (WHERE severity = 'high') AS high_count,
  COUNT(*) FILTER (WHERE expires_at IS NOT NULL AND expires_at < now() + interval '7 days') AS expiring_soon
FROM public.v_risk_debt_active
GROUP BY tenant_id;

-- Grant access to authenticated users
GRANT SELECT ON public.v_risk_debt_summary TO authenticated;

-- ============================================================================
-- Verification
-- ============================================================================
DO $$
DECLARE
  legacy_count integer;
  view_count integer;
BEGIN
  -- Check remaining legacy policies
  SELECT COUNT(*) INTO legacy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND policyname LIKE 'Super admin%'
    AND policyname NOT LIKE '%active_tenant%';
  
  -- Check views created
  SELECT COUNT(*) INTO view_count
  FROM information_schema.views
  WHERE table_schema = 'public'
    AND table_name IN ('v_risk_debt_active', 'v_risk_debt_summary');
  
  RAISE NOTICE 'Legacy policies remaining: % (expected: ~0 for migrated tables)', legacy_count;
  RAISE NOTICE 'Risk debt views created: % (expected: 2)', view_count;
END $$;
