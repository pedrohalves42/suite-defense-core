-- FIX Bug #1: Change FK from CASCADE to RESTRICT to prevent conflict with immutability trigger
-- Then rewrite cleanup function to handle the new constraint properly

-- Step 1: Drop the CASCADE FK and recreate as RESTRICT
ALTER TABLE public.job_executions 
  DROP CONSTRAINT job_executions_job_id_fkey;

ALTER TABLE public.job_executions 
  ADD CONSTRAINT job_executions_job_id_fkey 
  FOREIGN KEY (job_id) REFERENCES public.jobs(id) 
  ON DELETE RESTRICT;

-- Step 2: Rewrite cleanup function with proper error handling per-section
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
  -- FK is now RESTRICT, so we can ONLY delete jobs with zero executions.
  -- Jobs WITH executions are preserved forever as audit records.
  DELETE FROM public.jobs
  WHERE id IN (
    SELECT j.id 
    FROM public.jobs j
    LEFT JOIN public.job_executions je ON je.job_id = j.id
    WHERE j.status IN ('completed', 'failed', 'cancelled')
      AND j.created_at < now() - interval '60 days'
      AND je.id IS NULL
    LIMIT 500
  );
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
$$;

-- Ensure proper access control
REVOKE ALL ON FUNCTION public.cleanup_old_data_scheduled() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.cleanup_old_data_scheduled() TO postgres, service_role;