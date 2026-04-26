-- ADR-VELLUM V-303: Ensure check_security_thresholds is tenant-isolated
-- SECURITY: Even though this function is SECURITY DEFINER, it must never leak cross-tenant metrics.

CREATE OR REPLACE FUNCTION public.check_security_thresholds()
RETURNS TABLE(
  alert_type text,
  alert_severity text,
  message text,
  current_value integer,
  threshold integer,
  should_alert boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_tenant_id uuid := get_active_tenant_id();
BEGIN
  -- Fail-closed for non-super-admin sessions that lack active tenant context.
  IF v_tenant_id IS NULL AND NOT is_current_super_admin() THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT 
    'rls_violation'::text,
    'critical'::text,
    'RLS test failures detected'::text,
    (
      SELECT count(*)::int
      FROM rls_test_results r
      WHERE NOT r.passed
        AND r.tested_at > now() - interval '1 hour'
        AND (is_current_super_admin() OR r.tenant_id = v_tenant_id)
    )::int,
    0,
    (
      SELECT count(*) > 0
      FROM rls_test_results r
      WHERE NOT r.passed
        AND r.tested_at > now() - interval '1 hour'
        AND (is_current_super_admin() OR r.tenant_id = v_tenant_id)
    )

  UNION ALL

  SELECT 
    'critical_event_spike'::text,
    'warning'::text,
    'Unusual critical security event volume'::text,
    (
      SELECT count(*)::int
      FROM security_logs sl
      WHERE sl.severity = 'critical'
        AND sl.created_at > now() - interval '10 minutes'
        AND (is_current_super_admin() OR sl.tenant_id = v_tenant_id)
    )::int,
    5,
    (
      SELECT count(*) > 5
      FROM security_logs sl
      WHERE sl.severity = 'critical'
        AND sl.created_at > now() - interval '10 minutes'
        AND (is_current_super_admin() OR sl.tenant_id = v_tenant_id)
    )

  UNION ALL

  SELECT
    'unresolved_alerts'::text,
    'warning'::text,
    'Multiple unresolved critical alerts'::text,
    (
      SELECT count(*)::int
      FROM system_alerts sa
      WHERE sa.resolved = false
        AND sa.severity = 'critical'
        AND (is_current_super_admin() OR sa.tenant_id = v_tenant_id)
    )::int,
    3,
    (
      SELECT count(*) > 3
      FROM system_alerts sa
      WHERE sa.resolved = false
        AND sa.severity = 'critical'
        AND (is_current_super_admin() OR sa.tenant_id = v_tenant_id)
    );
END;
$function$;

COMMENT ON FUNCTION public.check_security_thresholds() IS
  'ADR-VELLUM V-303: Tenant-isolated SECURITY DEFINER. Non-super-admin without active tenant returns empty. Super-admin sees global.';
