-- =============================================================================
-- Create Tenant Isolation & RBAC Metrics Views for ANA
-- =============================================================================
-- These views expose existing security mechanisms as measurable metrics
-- so that the ANA audit system can evaluate isolation and RBAC compliance.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. View: v_tenant_isolation_metrics
-- Consolidates tenant isolation statistics from test_tenant_isolation()
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_tenant_isolation_metrics AS
WITH isolation_stats AS (
  SELECT 
    COUNT(*) as total_tables,
    COUNT(*) FILTER (WHERE isolation_valid) as tables_with_valid_isolation,
    COUNT(*) FILTER (WHERE has_rls_enabled) as tables_with_rls,
    COUNT(*) FILTER (WHERE has_tenant_id) as tables_with_tenant_id
  FROM public.test_tenant_isolation()
)
SELECT 
  total_tables,
  tables_with_rls,
  tables_with_tenant_id,
  tables_with_valid_isolation,
  ROUND(tables_with_rls::numeric / NULLIF(total_tables, 0) * 100, 2) as rls_coverage_pct,
  ROUND(tables_with_valid_isolation::numeric / NULLIF(total_tables, 0) * 100, 2) as isolation_coverage_pct,
  CASE 
    WHEN tables_with_rls = total_tables THEN 'complete'
    WHEN tables_with_rls >= total_tables * 0.95 THEN 'near_complete'
    WHEN tables_with_rls >= total_tables * 0.80 THEN 'partial'
    ELSE 'insufficient'
  END as rls_status,
  CASE 
    WHEN tables_with_valid_isolation >= total_tables * 0.70 THEN 'compliant'
    WHEN tables_with_valid_isolation >= total_tables * 0.50 THEN 'partial'
    ELSE 'non_compliant'
  END as isolation_status
FROM isolation_stats;

-- -----------------------------------------------------------------------------
-- 2. View: v_rbac_metrics
-- Aggregates RBAC statistics and verifies security function presence
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_rbac_metrics AS
SELECT 
  (SELECT COUNT(*) FROM public.tenants) as total_tenants,
  (SELECT COUNT(*) FROM public.user_roles) as total_role_assignments,
  (SELECT COUNT(DISTINCT user_id) FROM public.user_roles) as users_with_roles,
  (SELECT COUNT(DISTINCT role) FROM public.user_roles) as distinct_roles,
  (SELECT COUNT(*) FROM public.user_roles WHERE role = 'admin') as admin_count,
  (SELECT COUNT(*) FROM public.user_roles WHERE role = 'super_admin') as super_admin_count,
  (SELECT COUNT(*) FROM public.user_roles WHERE role = 'operator') as operator_count,
  (SELECT COUNT(*) FROM public.user_roles WHERE role = 'viewer') as viewer_count,
  -- Security functions verification
  EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.proname = 'current_user_tenant_id') as has_tenant_id_function,
  EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.proname = 'has_role') as has_role_function,
  EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.proname = 'is_super_admin') as has_super_admin_function,
  EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.proname = 'user_has_tenant_access') as has_tenant_access_function,
  CASE 
    WHEN (SELECT COUNT(*) FROM public.user_roles) > 0 
      AND EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.proname = 'current_user_tenant_id')
      AND EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.proname = 'has_role')
      AND EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.proname = 'is_super_admin')
    THEN 'operational'
    ELSE 'incomplete'
  END as rbac_status;

-- -----------------------------------------------------------------------------
-- 3. Update get_governance_snapshot() to include isolation & RBAC metrics
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_governance_snapshot()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_decision_events jsonb;
  v_ai_actions jsonb;
  v_policies jsonb;
  v_tenant_isolation jsonb;
  v_rbac jsonb;
BEGIN
  -- Decision Events metrics
  SELECT jsonb_build_object(
    'total', COUNT(*),
    'by_human', COUNT(*) FILTER (WHERE decision_source = 'human'),
    'by_system', COUNT(*) FILTER (WHERE decision_source IN ('system', 'ai')),
    'rollbacks', COUNT(*) FILTER (WHERE decision_type = 'rollback'),
    'alert_resolutions', COUNT(*) FILTER (WHERE decision_type = 'alert_resolution'),
    'last_24h', COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours')
  ) INTO v_decision_events
  FROM public.decision_events;

  -- AI Actions metrics
  SELECT jsonb_build_object(
    'total', COUNT(*),
    'approved', COUNT(*) FILTER (WHERE status = 'approved'),
    'rejected', COUNT(*) FILTER (WHERE status = 'rejected'),
    'pending', COUNT(*) FILTER (WHERE status = 'pending'),
    'human_reviewed', COUNT(*) FILTER (WHERE human_reviewed = true),
    'with_formal_approval', COUNT(*) FILTER (WHERE approved_at IS NOT NULL AND approved_by IS NOT NULL),
    'high_risk_with_approval', COUNT(*) FILTER (WHERE risk_level IN ('high', 'critical') AND approved_at IS NOT NULL)
  ) INTO v_ai_actions
  FROM public.ai_actions;

  -- Policies metrics
  SELECT jsonb_build_object(
    'total', COUNT(*),
    'enabled', COUNT(*) FILTER (WHERE enabled = true),
    'with_assignments', (
      SELECT COUNT(DISTINCT policy_id) FROM public.agent_group_policies
    )
  ) INTO v_policies
  FROM public.security_policies;

  -- Tenant Isolation metrics
  SELECT jsonb_build_object(
    'total_tables', total_tables,
    'tables_with_rls', tables_with_rls,
    'tables_with_tenant_id', tables_with_tenant_id,
    'tables_with_valid_isolation', tables_with_valid_isolation,
    'rls_coverage_pct', rls_coverage_pct,
    'isolation_coverage_pct', isolation_coverage_pct,
    'rls_status', rls_status,
    'isolation_status', isolation_status
  ) INTO v_tenant_isolation
  FROM public.v_tenant_isolation_metrics;

  -- RBAC metrics
  SELECT jsonb_build_object(
    'total_tenants', total_tenants,
    'total_role_assignments', total_role_assignments,
    'users_with_roles', users_with_roles,
    'distinct_roles', distinct_roles,
    'admin_count', admin_count,
    'super_admin_count', super_admin_count,
    'operator_count', operator_count,
    'viewer_count', viewer_count,
    'rbac_status', rbac_status,
    'security_functions_present', 
      has_tenant_id_function AND has_role_function AND has_super_admin_function AND has_tenant_access_function
  ) INTO v_rbac
  FROM public.v_rbac_metrics;

  -- Build complete snapshot
  v_result := jsonb_build_object(
    'decision_events', COALESCE(v_decision_events, '{}'::jsonb),
    'ai_actions', COALESCE(v_ai_actions, '{}'::jsonb),
    'policies', COALESCE(v_policies, '{}'::jsonb),
    'tenant_isolation', COALESCE(v_tenant_isolation, '{}'::jsonb),
    'rbac', COALESCE(v_rbac, '{}'::jsonb),
    'snapshot_at', NOW()
  );

  RETURN v_result;
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. Update governance_health_metrics view to include isolation & RBAC summary
-- -----------------------------------------------------------------------------
DROP VIEW IF EXISTS public.governance_health_metrics;

CREATE OR REPLACE VIEW public.governance_health_metrics AS
SELECT
  -- Decision Events metrics
  (SELECT COUNT(*) FROM public.decision_events) AS decision_events_total,
  (SELECT COUNT(*) FROM public.decision_events WHERE decision_source = 'human') AS decision_events_human,
  (SELECT COUNT(*) FROM public.decision_events WHERE decision_source IN ('system', 'ai')) AS decision_events_system,
  (SELECT COUNT(*) FROM public.decision_events WHERE decision_type = 'rollback') AS rollback_total,
  ROUND(
    (SELECT COUNT(*) FROM public.decision_events WHERE decision_source = 'human')::numeric / 
    NULLIF((SELECT COUNT(*) FROM public.decision_events), 0) * 100, 2
  ) AS human_decision_rate,
  
  -- AI Actions metrics
  (SELECT COUNT(*) FROM public.ai_actions WHERE approved_at IS NOT NULL) AS ai_actions_with_approval,
  (SELECT COUNT(*) FROM public.ai_actions WHERE risk_level IN ('high', 'critical') AND approved_at IS NOT NULL) AS high_risk_approved,
  
  -- Critical Alerts metrics
  (SELECT COUNT(*) FROM public.system_alerts WHERE severity = 'critical' AND resolved = true AND resolved_by IS NOT NULL) AS critical_alerts_human_resolved,
  
  -- DLQ metrics
  (SELECT COUNT(*) FROM public.failed_jobs_dlq WHERE status = 'resolved' AND decision_event_id IS NOT NULL) AS dlq_with_decision,
  
  -- Tenant Isolation & RBAC summary (from new views)
  (SELECT rls_coverage_pct FROM public.v_tenant_isolation_metrics) AS rls_coverage_pct,
  (SELECT isolation_coverage_pct FROM public.v_tenant_isolation_metrics) AS tenant_isolation_pct,
  (SELECT rls_status FROM public.v_tenant_isolation_metrics) AS rls_status,
  (SELECT isolation_status FROM public.v_tenant_isolation_metrics) AS isolation_status,
  (SELECT total_role_assignments FROM public.v_rbac_metrics) AS rbac_assignments,
  (SELECT rbac_status FROM public.v_rbac_metrics) AS rbac_status,
  (SELECT has_tenant_id_function AND has_role_function AND has_super_admin_function FROM public.v_rbac_metrics) AS security_functions_present,
  
  -- Snapshot timestamp
  NOW() AS snapshot_at;

-- Grant access to authenticated users
GRANT SELECT ON public.v_tenant_isolation_metrics TO authenticated;
GRANT SELECT ON public.v_rbac_metrics TO authenticated;
GRANT SELECT ON public.governance_health_metrics TO authenticated;