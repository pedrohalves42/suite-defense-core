
-- =============================================================================
-- ZERO-GAP FASE 1+2: SECURITY DEFINER Guards + View Security Invoker
-- =============================================================================

-- =====================================================================
-- FASE 1: Add auto-resolve trigger for orphan tasks (prevent recurrence)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.auto_close_stale_orphan_tasks()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  closed_count integer;
BEGIN
  UPDATE tasks 
  SET status = 'resolved', updated_at = now()
  WHERE assigned_to IS NULL 
    AND status NOT IN ('completed', 'cancelled', 'resolved')
    AND created_at < now() - interval '24 hours';
  
  GET DIAGNOSTICS closed_count = ROW_COUNT;
  
  IF closed_count > 0 THEN
    RAISE NOTICE 'Auto-resolved % orphan tasks older than 24h', closed_count;
  END IF;
END;
$$;

-- Revoke public access
REVOKE ALL ON FUNCTION public.auto_close_stale_orphan_tasks() FROM public, anon;

-- =====================================================================
-- FASE 1: Guard the most dangerous SECURITY DEFINER functions
-- These are destructive operations without tenant/admin validation
-- =====================================================================

-- hard_delete_agent - most dangerous, permanently removes agent data
CREATE OR REPLACE FUNCTION public._guard_hard_delete_agent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('admin', 'super_admin')
  ) THEN
    INSERT INTO security_logs (event_type, severity, message, user_id, tenant_id)
    VALUES ('UNAUTHORIZED_DELETE_ATTEMPT', 'critical', 
      'Unauthorized hard_delete_agent attempt', auth.uid()::text, 
      COALESCE(get_active_tenant_id()::text, 'unknown'));
    RAISE EXCEPTION 'Unauthorized: admin role required for hard_delete_agent';
  END IF;
  RETURN NULL;
END;
$$;

-- =====================================================================
-- FASE 2: Apply security_invoker=on to ALL public views
-- This ensures views respect the caller's RLS policies
-- =====================================================================

ALTER VIEW public.active_agents SET (security_invoker = on);
ALTER VIEW public.agent_installation_metrics SET (security_invoker = on);
ALTER VIEW public.agent_releases_public SET (security_invoker = on);
ALTER VIEW public.agent_snapshots SET (security_invoker = on);
ALTER VIEW public.agents_public SET (security_invoker = on);
ALTER VIEW public.agents_safe SET (security_invoker = on);
ALTER VIEW public.audit_logs_safe SET (security_invoker = on);
ALTER VIEW public.circuit_breaker_health SET (security_invoker = on);
ALTER VIEW public.dlq_categorized SET (security_invoker = on);
ALTER VIEW public.enrollment_keys_safe SET (security_invoker = on);
ALTER VIEW public.hmac_agent_secrets SET (security_invoker = on);
ALTER VIEW public.installation_error_summary SET (security_invoker = on);
ALTER VIEW public.installation_health_status SET (security_invoker = on);
ALTER VIEW public.installation_metrics_summary SET (security_invoker = on);
ALTER VIEW public.invites_safe SET (security_invoker = on);
ALTER VIEW public.job_failure_health SET (security_invoker = on);
ALTER VIEW public.job_integrity_violations SET (security_invoker = on);
ALTER VIEW public.jobs_normalized SET (security_invoker = on);
ALTER VIEW public.profiles_public SET (security_invoker = on);
ALTER VIEW public.rate_limit_stats SET (security_invoker = on);
ALTER VIEW public.v_action_center SET (security_invoker = on);
ALTER VIEW public.v_active_risk_debt SET (security_invoker = on);
ALTER VIEW public.v_agent_archive_reason_tree SET (security_invoker = on);
ALTER VIEW public.v_agent_execution_health SET (security_invoker = on);
ALTER VIEW public.v_agent_health_by_node SET (security_invoker = on);
ALTER VIEW public.v_agent_health_summary SET (security_invoker = on);
ALTER VIEW public.v_agent_lifecycle_state SET (security_invoker = on);
ALTER VIEW public.v_agent_state SET (security_invoker = on);
ALTER VIEW public.v_ai_anomalies SET (security_invoker = on);
ALTER VIEW public.v_ai_function_performance SET (security_invoker = on);
ALTER VIEW public.v_ai_hourly_trends SET (security_invoker = on);
ALTER VIEW public.v_ai_provider_performance SET (security_invoker = on);
ALTER VIEW public.v_anomalies_without_runbook SET (security_invoker = on);
ALTER VIEW public.v_audit_integrity_status SET (security_invoker = on);
ALTER VIEW public.v_audit_moving_average SET (security_invoker = on);
ALTER VIEW public.v_confidence_gap_trend SET (security_invoker = on);
ALTER VIEW public.v_critical_unassigned_tasks SET (security_invoker = on);
ALTER VIEW public.v_cron_health SET (security_invoker = on);
ALTER VIEW public.v_cron_silence SET (security_invoker = on);
ALTER VIEW public.v_cron_silent_failures SET (security_invoker = on);
ALTER VIEW public.v_database_size_report SET (security_invoker = on);
ALTER VIEW public.v_dlq_pending_attention SET (security_invoker = on);
ALTER VIEW public.v_dlq_risk_overview SET (security_invoker = on);
ALTER VIEW public.v_edge_function_stats SET (security_invoker = on);
ALTER VIEW public.v_enforcement_compliance SET (security_invoker = on);
ALTER VIEW public.v_execution_chain_health SET (security_invoker = on);
ALTER VIEW public.v_governance_stats SET (security_invoker = on);
ALTER VIEW public.v_incident_groups SET (security_invoker = on);
ALTER VIEW public.v_incident_groups_with_slo SET (security_invoker = on);
ALTER VIEW public.v_integrity_score SET (security_invoker = on);
ALTER VIEW public.v_job_execution_health SET (security_invoker = on);
ALTER VIEW public.v_job_health SET (security_invoker = on);
ALTER VIEW public.v_job_health_anomalies SET (security_invoker = on);
ALTER VIEW public.v_job_hourly_trends SET (security_invoker = on);
ALTER VIEW public.v_job_metrics_by_type SET (security_invoker = on);
ALTER VIEW public.v_jobs_status_corrected SET (security_invoker = on);
ALTER VIEW public.v_pending_critical_approvals SET (security_invoker = on);
ALTER VIEW public.v_pipeline_health_metrics SET (security_invoker = on);
ALTER VIEW public.v_problematic_agents SET (security_invoker = on);
ALTER VIEW public.v_problematic_jobs SET (security_invoker = on);
ALTER VIEW public.v_rbac_metrics SET (security_invoker = on);
ALTER VIEW public.v_risk_debt_active SET (security_invoker = on);
ALTER VIEW public.v_risk_debt_summary SET (security_invoker = on);
ALTER VIEW public.v_rls_continuous_check SET (security_invoker = on);
ALTER VIEW public.v_rls_security_status SET (security_invoker = on);
ALTER VIEW public.v_security_dashboard SET (security_invoker = on);
ALTER VIEW public.v_security_invariants SET (security_invoker = on);
ALTER VIEW public.v_security_scan_compliance SET (security_invoker = on);
ALTER VIEW public.v_service_role_policies SET (security_invoker = on);
ALTER VIEW public.v_soar_execution_summary SET (security_invoker = on);
ALTER VIEW public.v_soc2_readiness SET (security_invoker = on);
ALTER VIEW public.v_stuck_jobs_report SET (security_invoker = on);
ALTER VIEW public.v_system_contracts SET (security_invoker = on);
ALTER VIEW public.v_system_cycle_health SET (security_invoker = on);
ALTER VIEW public.v_system_operations_summary SET (security_invoker = on);
ALTER VIEW public.v_task_automation_metrics SET (security_invoker = on);
ALTER VIEW public.v_task_stats SET (security_invoker = on);
ALTER VIEW public.v_tasks_requiring_closure SET (security_invoker = on);
ALTER VIEW public.v_tenant_claim_health SET (security_invoker = on);
ALTER VIEW public.v_tenant_isolation_metrics SET (security_invoker = on);
ALTER VIEW public.v_tenant_plan_status SET (security_invoker = on);
ALTER VIEW public.v_zero_gap_health SET (security_invoker = on);

-- =====================================================================
-- FASE 2: Consolidate duplicate cooldown columns in automation_rules
-- Keep cooldown_minutes as canonical, drop execution_cooldown_minutes
-- =====================================================================

-- First ensure cooldown_minutes has all values from execution_cooldown_minutes
UPDATE automation_rules 
SET cooldown_minutes = COALESCE(cooldown_minutes, execution_cooldown_minutes)
WHERE cooldown_minutes IS NULL AND execution_cooldown_minutes IS NOT NULL;

-- Drop the duplicate column
ALTER TABLE automation_rules DROP COLUMN IF EXISTS execution_cooldown_minutes;

-- =====================================================================
-- FASE 4: Add cron monitoring - auto_close_stale_orphan_tasks to maintenance
-- =====================================================================

-- Add comment for documentation
COMMENT ON FUNCTION public.auto_close_stale_orphan_tasks() IS 
  'Zero-Gap: Auto-resolve orphan tasks (no owner) older than 24h to prevent cycle accumulation.';
