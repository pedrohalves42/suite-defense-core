-- Fix security definer view by recreating as invoker view
DROP VIEW IF EXISTS public.v_job_health;

CREATE VIEW public.v_job_health 
WITH (security_invoker = true)
AS
WITH job_stats AS (
  SELECT 
    job_name,
    MAX(ran_at) as last_run,
    MAX(CASE WHEN success THEN ran_at END) as last_success,
    COUNT(*) FILTER (WHERE NOT success AND ran_at > NOW() - INTERVAL '24 hours') as failure_count_24h,
    COUNT(*) FILTER (WHERE ran_at > NOW() - INTERVAL '24 hours') as total_runs_24h,
    AVG(duration_ms) FILTER (WHERE ran_at > NOW() - INTERVAL '24 hours') as avg_duration_ms,
    MAX(duration_ms) FILTER (WHERE ran_at > NOW() - INTERVAL '24 hours') as max_duration_ms
  FROM public.scheduled_job_runs
  GROUP BY job_name
)
SELECT 
  js.job_name,
  js.last_run,
  js.last_success,
  js.failure_count_24h,
  js.total_runs_24h,
  ROUND(js.avg_duration_ms::numeric, 2) as avg_duration_ms,
  js.max_duration_ms,
  CASE 
    WHEN js.last_run IS NULL THEN 'never_ran'
    WHEN js.failure_count_24h > 3 THEN 'failing'
    WHEN js.failure_count_24h > 0 AND js.total_runs_24h > 0 
         AND (js.failure_count_24h::float / js.total_runs_24h::float) > 0.5 THEN 'degraded'
    WHEN js.last_run < NOW() - INTERVAL '2 hours' THEN 'stale'
    ELSE 'healthy'
  END as health_status,
  CASE 
    WHEN js.failure_count_24h > 3 THEN 'critical'
    WHEN js.failure_count_24h > 0 THEN 'warning'
    WHEN js.last_run < NOW() - INTERVAL '2 hours' THEN 'warning'
    ELSE 'ok'
  END as severity
FROM job_stats js;