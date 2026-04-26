-- Fix security warning: Set search_path on get_job_health_summary
DROP FUNCTION IF EXISTS public.get_job_health_summary();

CREATE FUNCTION public.get_job_health_summary()
RETURNS JSON
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT json_build_object(
    'total_jobs', COUNT(DISTINCT job_key),
    'healthy_jobs', COUNT(DISTINCT job_key) FILTER (WHERE health_status = 'healthy'),
    'warning_jobs', COUNT(DISTINCT job_key) FILTER (WHERE health_status = 'warning'),
    'critical_jobs', COUNT(DISTINCT job_key) FILTER (WHERE health_status = 'critical'),
    'stale_jobs', COUNT(DISTINCT job_key) FILTER (WHERE health_status = 'stale'),
    'never_ran_jobs', COUNT(DISTINCT job_key) FILTER (WHERE health_status = 'never_ran')
  )
  FROM v_job_health;
$$;