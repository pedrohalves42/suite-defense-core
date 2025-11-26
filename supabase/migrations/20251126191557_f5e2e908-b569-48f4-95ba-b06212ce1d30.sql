-- Phase 5: Fix remaining 4 SECURITY DEFINER views with security_invoker and tenant filtering

-- 1. Recreate installation_error_summary with security_invoker and tenant filtering
DROP VIEW IF EXISTS public.installation_error_summary CASCADE;

CREATE VIEW public.installation_error_summary 
WITH (security_invoker = on) AS
SELECT 
  tenant_id,
  platform,
  error_message,
  COUNT(*) AS error_count,
  MAX(created_at) AS last_occurrence
FROM public.installation_analytics
WHERE success = false
  AND error_message IS NOT NULL
  AND tenant_id IN (
    SELECT tenant_id 
    FROM public.user_roles 
    WHERE user_id = auth.uid()
  )
GROUP BY tenant_id, platform, error_message
ORDER BY error_count DESC;

-- 2. Recreate installation_health_status with security_invoker and tenant filtering
DROP VIEW IF EXISTS public.installation_health_status CASCADE;

CREATE VIEW public.installation_health_status 
WITH (security_invoker = on) AS
SELECT 
  tenant_id,
  platform,
  COUNT(*) AS total_attempts,
  COUNT(*) FILTER (WHERE success = true) AS successful_attempts,
  COUNT(*) FILTER (WHERE success = false) AS failed_attempts,
  ROUND(
    CASE 
      WHEN COUNT(*) = 0 THEN 0
      ELSE 100.0 * COUNT(*) FILTER (WHERE success = true) / COUNT(*)
    END, 1
  ) AS success_rate_pct,
  AVG(installation_time_seconds) FILTER (WHERE installation_time_seconds > 0) AS avg_install_time_seconds
FROM public.installation_analytics
WHERE created_at > NOW() - INTERVAL '24 hours'
  AND event_type IN ('post_installation', 'post_installation_unverified')
  AND tenant_id IN (
    SELECT tenant_id 
    FROM public.user_roles 
    WHERE user_id = auth.uid()
  )
GROUP BY tenant_id, platform;

-- 3. Recreate jobs_normalized with security_invoker and tenant filtering
DROP VIEW IF EXISTS public.jobs_normalized CASCADE;

CREATE VIEW public.jobs_normalized 
WITH (security_invoker = on) AS
SELECT 
  id,
  tenant_id,
  agent_id,
  agent_name,
  type,
  status,
  payload,
  output,
  error_message,
  approved,
  created_at,
  scheduled_at,
  delivered_at,
  started_at,
  completed_at,
  finished_at,
  execution_time_seconds,
  is_recurring,
  recurrence_pattern,
  next_run_at,
  last_run_at,
  parent_job_id,
  CASE 
    WHEN status = 'queued' AND created_at < NOW() - INTERVAL '1 hour' THEN true
    WHEN status = 'delivered' AND delivered_at < NOW() - INTERVAL '1 hour' THEN true
    ELSE false
  END AS is_stuck
FROM public.jobs
WHERE tenant_id IN (
  SELECT tenant_id 
  FROM public.user_roles 
  WHERE user_id = auth.uid()
);

-- 4. Recreate v_problematic_jobs with security_invoker and tenant filtering
DROP VIEW IF EXISTS public.v_problematic_jobs CASCADE;

CREATE VIEW public.v_problematic_jobs 
WITH (security_invoker = on) AS
SELECT 
  j.id,
  j.tenant_id,
  j.agent_id,
  j.agent_name,
  j.type,
  j.status,
  j.error_message,
  j.created_at,
  j.delivered_at,
  j.started_at,
  j.completed_at,
  CASE 
    WHEN j.status = 'queued' AND j.created_at < NOW() - INTERVAL '1 hour' THEN 'stuck_queued'
    WHEN j.status = 'delivered' AND j.delivered_at < NOW() - INTERVAL '1 hour' THEN 'stuck_delivered'
    WHEN j.status = 'failed' THEN 'failed'
    ELSE 'unknown'
  END AS issue_type,
  EXTRACT(EPOCH FROM (NOW() - j.created_at))::INTEGER / 60 AS minutes_since_creation
FROM public.jobs j
WHERE (
    (j.status = 'queued' AND j.created_at < NOW() - INTERVAL '1 hour') OR
    (j.status = 'delivered' AND j.delivered_at < NOW() - INTERVAL '1 hour') OR
    (j.status = 'failed')
  )
  AND j.tenant_id IN (
    SELECT tenant_id 
    FROM public.user_roles 
    WHERE user_id = auth.uid()
  )
ORDER BY j.created_at DESC;

COMMENT ON VIEW public.installation_error_summary IS 'Tenant-isolated summary of installation errors grouped by platform and error message';
COMMENT ON VIEW public.installation_health_status IS 'Tenant-isolated installation health metrics by platform for last 24 hours';
COMMENT ON VIEW public.jobs_normalized IS 'Tenant-isolated normalized view of jobs with stuck status detection';
COMMENT ON VIEW public.v_problematic_jobs IS 'Tenant-isolated view of stuck and failed jobs requiring attention';