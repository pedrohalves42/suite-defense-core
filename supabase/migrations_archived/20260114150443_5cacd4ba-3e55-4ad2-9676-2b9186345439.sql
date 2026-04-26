-- =============================================================================
-- ADR-026: Security Operations Framework
-- Migration: Add security_invoker to all views + security functions + triggers
-- =============================================================================

-- 1. Create function to check security thresholds
CREATE OR REPLACE FUNCTION check_security_thresholds()
RETURNS TABLE (
  alert_type text,
  severity text,
  message text,
  current_value int,
  threshold int,
  should_alert boolean
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  -- Alert 1: RLS test failures
  SELECT 
    'rls_violation'::text,
    'critical'::text,
    'RLS test failures detected'::text,
    (SELECT count(*)::int FROM rls_test_results WHERE NOT passed AND tested_at > now() - interval '1 hour'),
    0,
    (SELECT count(*) > 0 FROM rls_test_results WHERE NOT passed AND tested_at > now() - interval '1 hour')
  
  UNION ALL
  
  -- Alert 2: Critical security event spike
  SELECT 
    'critical_event_spike'::text,
    'warning'::text,
    'Unusual critical security event volume'::text,
    (SELECT count(*)::int FROM security_logs WHERE severity = 'critical' AND created_at > now() - interval '10 minutes'),
    5,
    (SELECT count(*) > 5 FROM security_logs WHERE severity = 'critical' AND created_at > now() - interval '10 minutes')
  
  UNION ALL
  
  -- Alert 3: Open critical alerts accumulation
  SELECT
    'unresolved_alerts'::text,
    'warning'::text,
    'Multiple unresolved critical alerts'::text,
    (SELECT count(*)::int FROM system_alerts WHERE resolved = false AND severity = 'critical'),
    3,
    (SELECT count(*) > 3 FROM system_alerts WHERE resolved = false AND severity = 'critical');
END;
$$;

-- 2. Create function to automatically activate emergency mode
CREATE OR REPLACE FUNCTION auto_activate_emergency_mode()
RETURNS TRIGGER AS $$
BEGIN
  -- If detecting RLS violation or critical security alert
  IF NEW.alert_type IN ('rls_violation', 'rls_disabled') 
     AND NEW.severity = 'critical' THEN
    
    -- Check if not already in emergency mode (within last hour)
    IF NOT EXISTS (
      SELECT 1 FROM system_global_state 
      WHERE mode = 'emergency_stop' 
      AND triggered_at > now() - interval '1 hour'
    ) THEN
      -- Activate emergency mode
      INSERT INTO system_global_state (mode, reason, triggered_by)
      VALUES (
        'emergency_stop',
        format('Auto-triggered: %s', NEW.message),
        '00000000-0000-0000-0000-000000000000'::uuid
      );
      
      -- Log to audit
      INSERT INTO audit_logs (event_type, details, user_id, tenant_id)
      SELECT 
        'emergency_mode_auto_activated',
        jsonb_build_object(
          'alert_id', NEW.id,
          'alert_type', NEW.alert_type,
          'reason', NEW.message,
          'triggered_at', now()
        ),
        '00000000-0000-0000-0000-000000000000'::uuid,
        (SELECT id FROM tenants LIMIT 1);
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3. Create trigger for automatic emergency mode activation
DROP TRIGGER IF EXISTS trg_auto_emergency_mode ON system_alerts;
CREATE TRIGGER trg_auto_emergency_mode
  AFTER INSERT ON system_alerts
  FOR EACH ROW
  WHEN (NEW.severity = 'critical')
  EXECUTE FUNCTION auto_activate_emergency_mode();

-- 4. Create view for security dashboard data (consolidated KPIs)
CREATE OR REPLACE VIEW v_security_dashboard 
WITH (security_invoker = true) AS
SELECT
  now() AS snapshot_at,
  
  -- Security Events (24h)
  (SELECT count(*) FROM security_logs 
   WHERE created_at > now() - interval '24 hours' 
   AND severity = 'critical')::int AS critical_events_24h,
  (SELECT count(*) FROM security_logs 
   WHERE created_at > now() - interval '24 hours' 
   AND blocked = true)::int AS blocked_attacks_24h,
  
  -- System Health
  (SELECT count(*) FROM system_alerts 
   WHERE resolved = false 
   AND severity = 'critical')::int AS open_critical_alerts,
  
  -- Jobs Health
  (SELECT count(*) FROM jobs 
   WHERE status = 'failed' 
   AND created_at > now() - interval '1 hour')::int AS failed_jobs_1h,
  
  -- RLS Test Status
  (SELECT count(*) FROM rls_test_results 
   WHERE NOT passed 
   AND tested_at > now() - interval '24 hours')::int AS rls_failures_24h,
  (SELECT max(tested_at) FROM rls_test_results) AS last_rls_test,
  
  -- System Mode
  (SELECT mode FROM system_global_state 
   ORDER BY triggered_at DESC LIMIT 1) AS current_system_mode
WHERE is_current_super_admin();

-- 5. Create view for RLS continuous check
CREATE OR REPLACE VIEW v_rls_continuous_check
WITH (security_invoker = true) AS
SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  (SELECT count(*) FROM pg_policies p WHERE p.tablename = c.relname::text)::int AS policy_count,
  CASE 
    WHEN NOT c.relrowsecurity THEN 'CRITICAL'
    WHEN (SELECT count(*) FROM pg_policies p WHERE p.tablename = c.relname::text) = 0 THEN 'WARNING'
    ELSE 'OK'
  END AS status
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r'
  AND n.nspname = 'public'
  AND is_current_super_admin();

-- 6. Grant execute permission on check_security_thresholds
GRANT EXECUTE ON FUNCTION check_security_thresholds() TO authenticated;

-- 7. Add comment documenting the security operations framework
COMMENT ON FUNCTION check_security_thresholds() IS 
'ADR-026: Security Operations Framework - Returns current security threshold violations for alerting';

COMMENT ON FUNCTION auto_activate_emergency_mode() IS 
'ADR-026: Security Operations Framework - Automatically activates emergency mode on critical security alerts';

COMMENT ON VIEW v_security_dashboard IS 
'ADR-026: Security Operations Framework - Consolidated security KPIs for Control Plane dashboard';

COMMENT ON VIEW v_rls_continuous_check IS 
'ADR-026: Security Operations Framework - Real-time RLS status check for all public tables';