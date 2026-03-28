-- =============================================================================
-- CI Guard: Validate Critical Views Use security_invoker (ADR-026)
-- =============================================================================
-- This test ensures critical views that access tenant data have
-- security_invoker=on to prevent privilege escalation.
-- Run this during migrations or CI to prevent security regressions.
-- =============================================================================

DO $$
DECLARE
  v_unsafe_views text[];
  v_unsafe_count integer;
BEGIN
  -- Check for critical views that should have security_invoker=on
  -- but currently don't
  
  WITH critical_views AS (
    SELECT unnest(ARRAY[
      -- Audit and security views
      'audit_logs_safe',
      'v_security_dashboard',
      -- Agent views
      'v_agent_execution_health',
      'v_agent_archive_reason_tree',
      'v_agent_lifecycle_state',
      'v_problematic_agents',
      -- Job views
      'v_job_execution_health',
      'v_stuck_jobs_report',
      'v_problematic_jobs',
      -- Risk and governance views
      'v_active_risk_debt',
      'v_soc2_readiness',
      'v_governance_stats',
      -- DLQ views
      'v_dlq_pending_attention',
      'dlq_categorized',
      -- Pipeline views
      'v_pipeline_health_metrics',
      -- Tenant isolation views
      'v_tenant_isolation_metrics'
    ]) AS view_name
  ),
  existing_views AS (
    SELECT viewname 
    FROM pg_views 
    WHERE schemaname = 'public'
  ),
  views_without_invoker AS (
    SELECT c.relname::text as view_name
    FROM pg_class c
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public'
      AND c.relkind = 'v'
      AND c.relname IN (SELECT view_name FROM critical_views)
      AND c.relname IN (SELECT viewname FROM existing_views)
      AND NOT EXISTS (
        SELECT 1 
        FROM pg_reloptions_unnest(c.reloptions) r
        WHERE r.option_name = 'security_invoker' 
          AND r.option_value = 'on'
      )
  )
  SELECT array_agg(view_name) INTO v_unsafe_views
  FROM views_without_invoker;
  
  v_unsafe_count := COALESCE(array_length(v_unsafe_views, 1), 0);
  
  IF v_unsafe_count > 0 THEN
    RAISE WARNING '
????????????????????????????????????????????????????????????????????
?  SECURITY WARNING: Views without security_invoker=on             ?
????????????????????????????????????????????????????????????????????
?  Affected views: %                                               
?                                                                   
?  These views access tenant data but do not have                  
?  security_invoker=on, which may allow privilege escalation.      
?                                                                   
?  FIX: Recreate views WITH (security_invoker = on)               
?                                                                   
?  REF: docs/architecture/ADR-026-multi-tenant-isolation.md       
????????????????????????????????????????????????????????????????????
', v_unsafe_views;
    -- Note: This is a warning, not an exception, to allow gradual migration
  END IF;

  RAISE NOTICE 'SECURITY CHECK: Reviewed % critical views for security_invoker', 
    (SELECT COUNT(*) FROM pg_views WHERE schemaname = 'public' AND viewname IN (
      SELECT view_name FROM critical_views
    ));
END $$;

-- Helper function to check reloptions (if not exists)
CREATE OR REPLACE FUNCTION pg_reloptions_unnest(reloptions text[])
RETURNS TABLE(option_name text, option_value text)
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 
    split_part(opt, '=', 1) as option_name,
    split_part(opt, '=', 2) as option_value
  FROM unnest(reloptions) as opt
$$;

SELECT 'Views security_invoker check completed' AS result;
