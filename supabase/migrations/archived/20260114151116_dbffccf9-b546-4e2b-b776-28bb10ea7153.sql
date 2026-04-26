-- ============================================================================
-- ADR-026: Fix Security Operations Framework - Phase Final
-- Fixes: check_security_thresholds(), v_security_dashboard, alert cleanup
-- ============================================================================

-- ============================================================================
-- FIX 1: Corrigir funcao check_security_thresholds() (coluna ambigua)
-- ============================================================================
DROP FUNCTION IF EXISTS check_security_thresholds();

CREATE OR REPLACE FUNCTION check_security_thresholds()
RETURNS TABLE (
  alert_type text,
  alert_severity text,
  message text,
  current_value int,
  threshold int,
  should_alert boolean
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT 
    'rls_violation'::text,
    'critical'::text,
    'RLS test failures detected'::text,
    (SELECT count(*)::int FROM rls_test_results r WHERE NOT r.passed AND r.tested_at > now() - interval '1 hour'),
    0,
    (SELECT count(*) > 0 FROM rls_test_results r WHERE NOT r.passed AND r.tested_at > now() - interval '1 hour')
  
  UNION ALL
  
  SELECT 
    'critical_event_spike'::text,
    'warning'::text,
    'Unusual critical security event volume'::text,
    (SELECT count(*)::int FROM security_logs sl WHERE sl.severity = 'critical' AND sl.created_at > now() - interval '10 minutes'),
    5,
    (SELECT count(*) > 5 FROM security_logs sl WHERE sl.severity = 'critical' AND sl.created_at > now() - interval '10 minutes')
  
  UNION ALL
  
  SELECT
    'unresolved_alerts'::text,
    'warning'::text,
    'Multiple unresolved critical alerts'::text,
    (SELECT count(*)::int FROM system_alerts sa WHERE sa.resolved = false AND sa.severity = 'critical'),
    3,
    (SELECT count(*) > 3 FROM system_alerts sa WHERE sa.resolved = false AND sa.severity = 'critical');
END;
$$;

GRANT EXECUTE ON FUNCTION check_security_thresholds() TO authenticated;
COMMENT ON FUNCTION check_security_thresholds() IS 'ADR-026: Security threshold checker - fixed ambiguous column names';

-- ============================================================================
-- FIX 2: Corrigir view v_security_dashboard (WHERE sem FROM + coluna correta)
-- ============================================================================
DROP VIEW IF EXISTS v_security_dashboard;

CREATE OR REPLACE VIEW v_security_dashboard
WITH (security_invoker = true) AS
SELECT
  now() AS snapshot_at,
  (SELECT count(*)::int FROM security_logs 
   WHERE created_at > now() - interval '24 hours' AND severity = 'critical') AS critical_events_24h,
  (SELECT count(*)::int FROM security_logs 
   WHERE created_at > now() - interval '24 hours' AND blocked = true) AS blocked_attacks_24h,
  (SELECT count(*)::int FROM system_alerts 
   WHERE resolved = false AND severity = 'critical') AS open_critical_alerts,
  (SELECT count(*)::int FROM scheduled_job_runs 
   WHERE success = false AND ran_at > now() - interval '1 hour') AS failed_jobs_1h,
  (SELECT count(*)::int FROM rls_test_results 
   WHERE NOT passed AND tested_at > now() - interval '24 hours') AS rls_failures_24h,
  (SELECT max(tested_at) FROM rls_test_results) AS last_rls_test,
  (SELECT mode FROM system_global_state ORDER BY triggered_at DESC LIMIT 1) AS current_system_mode;

COMMENT ON VIEW v_security_dashboard IS 'ADR-026: Unified security KPIs - protected by security_invoker + base table RLS';