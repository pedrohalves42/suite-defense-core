-- =============================================================================
-- SECURITY REMEDIATION: Critical Fixes from Audit
-- =============================================================================
-- PHASE 1: Fix 31 SECURITY DEFINER views -> SECURITY INVOKER
-- PHASE 2: Fix 9 functions without search_path
-- PHASE 3: Enable RLS on partition table
-- =============================================================================

-- =============================================================================
-- PHASE 1: SECURITY INVOKER for all public views
-- =============================================================================

ALTER VIEW public.active_agents SET (security_invoker = true);
ALTER VIEW public.agents_health_view SET (security_invoker = true);
ALTER VIEW public.agents_public SET (security_invoker = true);
ALTER VIEW public.agents_safe SET (security_invoker = true);
ALTER VIEW public.governance_health_metrics SET (security_invoker = true);
ALTER VIEW public.hmac_agent_secrets SET (security_invoker = true);
ALTER VIEW public.invites_safe SET (security_invoker = true);
ALTER VIEW public.v_action_center SET (security_invoker = true);
ALTER VIEW public.v_active_risk_debt SET (security_invoker = true);
ALTER VIEW public.v_agent_archive_reason_tree SET (security_invoker = true);
ALTER VIEW public.v_agent_execution_health SET (security_invoker = true);
ALTER VIEW public.v_agent_health_summary SET (security_invoker = true);
ALTER VIEW public.v_agent_lifecycle_state SET (security_invoker = true);
ALTER VIEW public.v_anomalies_without_runbook SET (security_invoker = true);
ALTER VIEW public.v_audit_moving_average SET (security_invoker = true);
ALTER VIEW public.v_dlq_pending_attention SET (security_invoker = true);
ALTER VIEW public.v_enforcement_compliance SET (security_invoker = true);
ALTER VIEW public.v_execution_chain_health SET (security_invoker = true);
ALTER VIEW public.v_governance_stats SET (security_invoker = true);
ALTER VIEW public.v_incident_groups_with_slo SET (security_invoker = true);
ALTER VIEW public.v_job_health_anomalies SET (security_invoker = true);
ALTER VIEW public.v_problematic_agents SET (security_invoker = true);
ALTER VIEW public.v_rbac_metrics SET (security_invoker = true);
ALTER VIEW public.v_risk_debt_active SET (security_invoker = true);
ALTER VIEW public.v_risk_debt_summary SET (security_invoker = true);
ALTER VIEW public.v_system_contracts SET (security_invoker = true);
ALTER VIEW public.v_system_operations_summary SET (security_invoker = true);
ALTER VIEW public.v_task_stats SET (security_invoker = true);
ALTER VIEW public.v_tasks_requiring_closure SET (security_invoker = true);
ALTER VIEW public.v_tenant_isolation_metrics SET (security_invoker = true);
ALTER VIEW public.v_tenant_plan_status SET (security_invoker = true);

-- Also fix v_agent_health_by_node if it exists
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM pg_views WHERE schemaname = 'public' AND viewname = 'v_agent_health_by_node') THEN
    EXECUTE 'ALTER VIEW public.v_agent_health_by_node SET (security_invoker = true)';
  END IF;
END $$;

-- Fix enrollment_keys_safe if it exists
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM pg_views WHERE schemaname = 'public' AND viewname = 'enrollment_keys_safe') THEN
    EXECUTE 'ALTER VIEW public.enrollment_keys_safe SET (security_invoker = true)';
  END IF;
END $$;

-- =============================================================================
-- PHASE 2: Add search_path to all functions without it (correct signatures)
-- =============================================================================

ALTER FUNCTION public.calculate_task_fingerprint() SET search_path = public, pg_temp;
ALTER FUNCTION public.enforce_job_state_transitions() SET search_path = public, pg_temp;
ALTER FUNCTION public.ensure_completed_at_on_terminal() SET search_path = public, pg_temp;
ALTER FUNCTION public.evaluate_job_slo() SET search_path = public, pg_temp;
ALTER FUNCTION public.get_slo_target_for_severity(p_severity text) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_system_mode() SET search_path = public, pg_temp;
ALTER FUNCTION public.mark_fingerprint_slo_dirty() SET search_path = public, pg_temp;
ALTER FUNCTION public.sanitize_dlq_payload() SET search_path = public, pg_temp;
ALTER FUNCTION public.severity_floor_rate(p_severity text) SET search_path = public, pg_temp;

-- =============================================================================
-- PHASE 3: Enable RLS on partition table
-- =============================================================================

ALTER TABLE public.agent_system_metrics_2026_02 ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for the partition (inherit from parent pattern)
CREATE POLICY "Users can view metrics for their tenant agents 2026_02" 
ON public.agent_system_metrics_2026_02 
FOR SELECT 
USING (
  tenant_id IN (
    SELECT tenant_id FROM public.profiles WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Service role full access to metrics 2026_02" 
ON public.agent_system_metrics_2026_02 
FOR ALL 
TO service_role
USING (true)
WITH CHECK (true);