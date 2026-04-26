
-- Fix race condition in cleanup_old_data_scheduled
-- Use DELETE with NOT EXISTS subquery (evaluated atomically) instead of LEFT JOIN
CREATE OR REPLACE FUNCTION public.cleanup_old_data_scheduled()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hmac_deleted INTEGER := 0;
  v_rate_limits_deleted INTEGER := 0;
  v_failed_logins_deleted INTEGER := 0;
  v_efm_deleted INTEGER := 0;
  v_old_jobs_deleted INTEGER := 0;
  v_result jsonb;
BEGIN
  -- Clean expired HMAC signatures
  DELETE FROM public.hmac_signatures WHERE used_at < now() - interval '6 hours';
  GET DIAGNOSTICS v_hmac_deleted = ROW_COUNT;
  
  -- Clean expired rate limits
  DELETE FROM public.rate_limits WHERE window_start < now() - interval '30 minutes';
  GET DIAGNOSTICS v_rate_limits_deleted = ROW_COUNT;
  
  -- Clean old failed login attempts
  DELETE FROM public.failed_login_attempts WHERE created_at < now() - interval '24 hours';
  GET DIAGNOSTICS v_failed_logins_deleted = ROW_COUNT;
  
  -- Clean old edge function metrics
  DELETE FROM public.edge_function_metrics WHERE created_at < now() - interval '7 days';
  GET DIAGNOSTICS v_efm_deleted = ROW_COUNT;
  
  -- IMPORTANT: job_executions are IMMUTABLE (audit trail).
  -- FK is RESTRICT, so we can ONLY delete jobs with zero executions.
  -- Using NOT EXISTS for atomic evaluation (no race condition).
  -- Wrapped in BEGIN/EXCEPTION to gracefully handle any remaining FK conflicts.
  BEGIN
    DELETE FROM public.jobs
    WHERE status IN ('completed', 'failed', 'cancelled')
      AND created_at < now() - interval '60 days'
      AND NOT EXISTS (
        SELECT 1 FROM public.job_executions je WHERE je.job_id = jobs.id
      )
      AND id IN (
        SELECT id FROM public.jobs
        WHERE status IN ('completed', 'failed', 'cancelled')
          AND created_at < now() - interval '60 days'
        LIMIT 500
      );
    GET DIAGNOSTICS v_old_jobs_deleted = ROW_COUNT;
  EXCEPTION WHEN foreign_key_violation THEN
    -- Race condition: an execution was created between check and delete
    v_old_jobs_deleted = 0;
  END;
  
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
$$;

-- Maintain access control
REVOKE ALL ON FUNCTION public.cleanup_old_data_scheduled() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.cleanup_old_data_scheduled() TO postgres, service_role;
