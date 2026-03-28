-- =============================================================================
-- CI Guard: Validate Views Use get_active_tenant_id() (ADR-026)
-- =============================================================================
-- This test ensures critical views use get_active_tenant_id() instead of
-- the insecure user_roles subquery pattern.
-- Run this during migrations or CI to prevent security regressions.
-- =============================================================================

DO $$
DECLARE
  insecure_views text[];
  insecure_count integer;
BEGIN
  -- Check for views using the old user_roles subquery pattern
  -- instead of get_active_tenant_id()
  SELECT array_agg(viewname) INTO insecure_views
  FROM pg_views
  WHERE schemaname = 'public'
    AND viewname IN (
      -- Core security views
      'agents_safe', 'agents_public', 'agents_health_view',
      'invites_safe', 'enrollment_keys_safe', 'profiles_public',
      -- Audit & security views (ADR-026 hardened)
      'audit_logs_safe', 'v_security_dashboard',
      -- Health & monitoring views
      'v_agent_health_summary', 'v_agent_health_by_node', 'v_agent_lifecycle_state',
      'v_problematic_agents', 'v_problematic_jobs',
      -- Agent execution views (ADR-026 hardened)
      'v_agent_execution_health', 'v_agent_archive_reason_tree',
      -- Action & governance views  
      'v_action_center', 'v_soc2_readiness', 'v_governance_stats',
      -- Risk & compliance views (ADR-026 hardened)
      'v_active_risk_debt', 'v_confidence_gap_trend', 'v_tasks_requiring_closure',
      -- DLQ & jobs views
      'v_dlq_pending_attention', 'dlq_categorized', 'jobs_normalized',
      'v_job_hourly_trends', 'v_stuck_jobs_report',
      -- Job metrics views (ADR-026 hardened)
      'v_job_execution_health', 'v_jobs_status_corrected', 'v_job_metrics_by_type',
      -- System views
      'v_system_operations_summary', 'v_tenant_plan_status', 'v_rbac_metrics',
      -- Tenant isolation views (ADR-026 hardened)
      'v_tenant_isolation_metrics', 'v_pipeline_health_metrics'
    )
    AND definition LIKE '%tenant_id IN%'
    AND definition LIKE '%user_roles%'
    AND definition NOT LIKE '%get_active_tenant_id()%';

  insecure_count := COALESCE(array_length(insecure_views, 1), 0);

  IF insecure_count > 0 THEN
    RAISE EXCEPTION '
????????????????????????????????????????????????????????????????????
?  SECURITY VIOLATION: Views using insecure tenant pattern        ?
????????????????????????????????????????????????????????????????????
?  Affected views: %                                               
?                                                                   
?  These views use "tenant_id IN (SELECT ... FROM user_roles)"    
?  which exposes ALL tenants the user has access to.               
?                                                                   
?  FIX: Use "tenant_id = public.get_active_tenant_id()"           
?       OR "public.is_current_super_admin()" instead.              
?                                                                   
?  REF: docs/architecture/ADR-026-multi-tenant-isolation.md       
????????????????????????????????????????????????????????????????????
', insecure_views;
  END IF;

  RAISE NOTICE 'SECURITY CHECK PASSED: All critical views use get_active_tenant_id()';
END $$;

SELECT 'Views active tenant pattern check passed' AS result;
