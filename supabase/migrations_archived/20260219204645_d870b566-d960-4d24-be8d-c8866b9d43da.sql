
-- =====================================================================
-- FIX BUG #1: cleanup_old_data_scheduled fails 24x/day
-- Remove the job_executions deletion that conflicts with immutability trigger
-- =====================================================================

CREATE OR REPLACE FUNCTION public.cleanup_old_data_scheduled()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_hmac_deleted INTEGER := 0;
  v_rate_limits_deleted INTEGER := 0;
  v_failed_logins_deleted INTEGER := 0;
  v_efm_deleted INTEGER := 0;
  v_old_jobs_deleted INTEGER := 0;
  v_result jsonb;
BEGIN
  DELETE FROM public.hmac_signatures WHERE used_at < now() - interval '6 hours';
  GET DIAGNOSTICS v_hmac_deleted = ROW_COUNT;
  
  DELETE FROM public.rate_limits WHERE window_start < now() - interval '30 minutes';
  GET DIAGNOSTICS v_rate_limits_deleted = ROW_COUNT;
  
  DELETE FROM public.failed_login_attempts WHERE created_at < now() - interval '24 hours';
  GET DIAGNOSTICS v_failed_logins_deleted = ROW_COUNT;
  
  DELETE FROM public.edge_function_metrics WHERE created_at < now() - interval '7 days';
  GET DIAGNOSTICS v_efm_deleted = ROW_COUNT;
  
  -- FIX: Do NOT delete job_executions - they are immutable audit records
  -- protected by prevent_execution_deletion trigger.
  -- Only delete orphan jobs (no executions) older than 60 days.
  WITH deletable_jobs AS (
    SELECT j.id 
    FROM public.jobs j
    WHERE j.status IN ('completed', 'failed', 'cancelled')
      AND j.created_at < now() - interval '60 days'
      AND NOT EXISTS (SELECT 1 FROM job_executions je WHERE je.job_id = j.id)
    LIMIT 500
  )
  DELETE FROM public.jobs
  USING deletable_jobs dj
  WHERE jobs.id = dj.id;
  GET DIAGNOSTICS v_old_jobs_deleted = ROW_COUNT;
  
  v_result := jsonb_build_object(
    'success', true,
    'hmac_deleted', v_hmac_deleted,
    'rate_limits_deleted', v_rate_limits_deleted,
    'failed_logins_deleted', v_failed_logins_deleted,
    'edge_function_metrics_deleted', v_efm_deleted,
    'old_jobs_deleted', v_old_jobs_deleted,
    'executed_at', now()
  );
  
  INSERT INTO public.cron_health_checks (cron_name, last_success_at, consecutive_failures, updated_at)
  VALUES ('cleanup-old-data-hourly', now(), 0, now())
  ON CONFLICT (cron_name) DO UPDATE SET
    last_success_at = now(),
    consecutive_failures = 0,
    last_error = NULL,
    updated_at = now();
  
  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.cron_health_checks (cron_name, last_failure_at, last_error, consecutive_failures, updated_at)
  VALUES ('cleanup-old-data-hourly', now(), SQLERRM, 1, now())
  ON CONFLICT (cron_name) DO UPDATE SET
    last_failure_at = now(),
    last_error = SQLERRM,
    consecutive_failures = cron_health_checks.consecutive_failures + 1,
    updated_at = now();
  RAISE;
END;
$function$;


-- =====================================================================
-- FIX BUG #2: Install the auto_cancel trigger (function exists but trigger doesn't)
-- =====================================================================

DROP TRIGGER IF EXISTS trg_auto_cancel_jobs_on_offline ON agents;

CREATE TRIGGER trg_auto_cancel_jobs_on_offline
  AFTER UPDATE ON agents
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_cancel_jobs_on_agent_offline();


-- =====================================================================
-- FIX BUG #4: Tenant isolation for v_rbac_metrics
-- Must DROP + CREATE because column list changed (removed pg_proc checks)
-- =====================================================================

DROP VIEW IF EXISTS v_rbac_metrics;

CREATE VIEW v_rbac_metrics
WITH (security_invoker = on, security_barrier = true)
AS
SELECT tenant_id,
    count(*) AS total_users,
    count(*) FILTER (WHERE role = 'admin'::app_role) AS admin_count,
    count(*) FILTER (WHERE role = 'super_admin'::app_role) AS super_admin_count,
    count(*) FILTER (WHERE role = 'operator'::app_role) AS operator_count,
    count(*) FILTER (WHERE role = 'viewer'::app_role) AS viewer_count,
    count(*) FILTER (WHERE role = 'analyst'::app_role) AS analyst_count,
    count(DISTINCT role) AS distinct_roles,
    CASE
      WHEN count(*) > 0 THEN 'operational'::text
      ELSE 'incomplete'::text
    END AS rbac_status
FROM user_roles
WHERE auth.uid() IS NOT NULL
  AND (tenant_id = get_active_tenant_id() OR is_current_super_admin())
GROUP BY tenant_id;

REVOKE ALL ON v_rbac_metrics FROM anon;
GRANT SELECT ON v_rbac_metrics TO authenticated;


-- =====================================================================
-- FIX BUG #4: Tenant isolation for v_zero_gap_health
-- This is a system-wide monitoring view, add auth check
-- =====================================================================

DROP VIEW IF EXISTS v_zero_gap_health;

CREATE VIEW v_zero_gap_health
WITH (security_invoker = on, security_barrier = true)
AS
SELECT 
    (SELECT count(*) FROM jobs
     WHERE status IN ('pending', 'queued', 'delivered') AND expires_at < now()) AS expired_jobs_stuck,
    (SELECT count(*) FROM jobs
     WHERE status = 'delivered' AND created_at < now() - interval '2 hours') AS zombie_delivered,
    (SELECT count(*) FROM failed_jobs_dlq
     WHERE status = 'pending') AS dlq_pending,
    (SELECT count(*) FROM failed_jobs_dlq
     WHERE status = 'exhausted') AS dlq_exhausted,
    (SELECT count(*) FROM tasks
     WHERE status IN ('open', 'in_progress') AND updated_at < now() - interval '14 days') AS stale_tasks,
    (SELECT count(*) FROM cron_health_checks
     WHERE consecutive_failures > 3) AS failing_crons,
    (SELECT count(*) FROM domain_events) AS domain_events_total,
    (SELECT count(*) FROM jobs
     WHERE status IN ('pending', 'queued', 'delivered')) AS active_jobs,
    (SELECT count(*) FROM jobs
     WHERE status = 'completed' AND created_at > now() - interval '24 hours') AS completed_24h,
    (SELECT count(*) FROM jobs
     WHERE status = 'failed' AND created_at > now() - interval '24 hours') AS failed_24h
WHERE auth.uid() IS NOT NULL AND is_current_super_admin();

REVOKE ALL ON v_zero_gap_health FROM anon;
GRANT SELECT ON v_zero_gap_health TO authenticated;

COMMENT ON VIEW v_zero_gap_health IS 'System health dashboard. Restricted to super_admin only. security_invoker=on.';
