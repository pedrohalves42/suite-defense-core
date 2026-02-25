
-- 1. Fix permission: GRANT execute on log_session_start to authenticated
GRANT EXECUTE ON FUNCTION public.log_session_start(text, text) TO authenticated;

-- 2. Drop and recreate v_job_health with correct columns
DROP VIEW IF EXISTS public.v_job_health;

CREATE VIEW public.v_job_health AS
SELECT 
  job_key,
  job_source,
  count(*) AS total_runs_24h,
  count(*) FILTER (WHERE success IS TRUE) AS success_count_24h,
  count(*) FILTER (WHERE success IS FALSE) AS failure_count_24h,
  max(ran_at) AS last_run,
  max(ran_at) FILTER (WHERE success IS TRUE) AS last_success,
  max(ran_at) FILTER (WHERE success IS FALSE) AS last_failure,
  (avg(duration_ms))::numeric(10,2) AS avg_duration_ms,
  (max(duration_ms))::numeric(10,2) AS max_duration_ms,
  CASE
    WHEN count(*) = 0 THEN 'never_ran'
    WHEN max(ran_at) < now() - interval '2 hours' THEN 'stale'
    WHEN count(*) FILTER (WHERE success IS FALSE AND ran_at > now() - interval '1 hour') > 3 THEN 'critical'
    WHEN count(*) FILTER (WHERE success IS FALSE AND ran_at > now() - interval '2 hours') > 0 THEN 'warning'
    ELSE 'healthy'
  END AS health_status,
  CASE
    WHEN count(*) = 0 THEN 'low'
    WHEN max(ran_at) < now() - interval '2 hours' THEN 'medium'
    WHEN count(*) FILTER (WHERE success IS FALSE AND ran_at > now() - interval '1 hour') > 3 THEN 'critical'
    WHEN count(*) FILTER (WHERE success IS FALSE AND ran_at > now() - interval '2 hours') > 0 THEN 'high'
    ELSE 'low'
  END AS severity
FROM scheduled_job_runs
WHERE ran_at > now() - interval '24 hours'
  AND is_current_super_admin()
GROUP BY job_key, job_source;

-- Grant access
GRANT SELECT ON public.v_job_health TO authenticated;
