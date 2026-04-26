-- C1: Fix SECURITY DEFINER function without search_path
-- This prevents potential search_path hijacking attacks

CREATE OR REPLACE FUNCTION public.check_security_thresholds()
 RETURNS TABLE(alert_type text, alert_severity text, message text, current_value integer, threshold integer, should_alert boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
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
$function$;