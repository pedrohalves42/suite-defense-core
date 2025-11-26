-- Phase 5 Correction: Recreate jobs_normalized with missing computed columns
-- Fix: Add normalized_status, is_v3, duration_seconds for frontend compatibility

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
  status AS normalized_status,  -- Alias for frontend compatibility
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
  execution_time_seconds AS duration_seconds,  -- Alias for frontend compatibility
  is_recurring,
  recurrence_pattern,
  next_run_at,
  last_run_at,
  parent_job_id,
  -- is_v3: Jobs v3 are identified by presence of started_at or finished_at
  CASE 
    WHEN started_at IS NOT NULL OR finished_at IS NOT NULL THEN true
    ELSE false
  END AS is_v3,
  -- is_stuck: detect stuck jobs
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

COMMENT ON VIEW public.jobs_normalized IS 'Secure view of jobs with computed columns (normalized_status, is_v3, duration_seconds, is_stuck) for frontend compatibility. Filters by tenant_id for multi-tenant isolation.';