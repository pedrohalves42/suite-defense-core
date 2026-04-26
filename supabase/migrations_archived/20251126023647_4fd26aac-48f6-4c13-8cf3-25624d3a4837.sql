-- Fix jobs_normalized view security and cleanup invalid jobs

-- Step 1: Drop existing view
DROP VIEW IF EXISTS public.jobs_normalized;

-- Step 2: Recreate view with security_invoker and tenant_id filtering
CREATE VIEW public.jobs_normalized
WITH (security_invoker = true)
AS
SELECT 
  j.id,
  j.agent_name,
  j.agent_id,
  j.type,
  j.payload,
  j.status,
  j.created_at,
  j.delivered_at,
  j.started_at,
  j.finished_at,
  j.completed_at,
  j.error_message,
  j.tenant_id,
  j.approved,
  j.scheduled_at,
  j.is_recurring,
  j.recurrence_pattern,
  j.next_run_at,
  j.last_run_at,
  j.parent_job_id,
  -- V3 fields
  j.output,
  j.execution_time_seconds,
  -- Normalized status (v1 'done' -> v3 'completed')
  CASE 
    WHEN j.status = 'done' THEN 'completed'
    ELSE j.status
  END as normalized_status,
  -- Flag to indicate v3 job (has structured output)
  (j.output IS NOT NULL) as is_v3,
  -- Calculate duration in seconds
  CASE 
    WHEN j.execution_time_seconds IS NOT NULL THEN j.execution_time_seconds
    WHEN j.finished_at IS NOT NULL AND j.started_at IS NOT NULL THEN 
      EXTRACT(EPOCH FROM (j.finished_at - j.started_at))::integer
    WHEN j.completed_at IS NOT NULL AND j.delivered_at IS NOT NULL THEN
      EXTRACT(EPOCH FROM (j.completed_at - j.delivered_at))::integer
    ELSE NULL
  END as duration_seconds
FROM public.jobs j
WHERE j.tenant_id IN (
  SELECT ur.tenant_id 
  FROM public.user_roles ur 
  WHERE ur.user_id = auth.uid()
);

-- Step 3: Grant access to authenticated users
GRANT SELECT ON public.jobs_normalized TO authenticated;

-- Step 4: Add comment
COMMENT ON VIEW public.jobs_normalized IS 'Secure view of jobs with v1/v3 compatibility, RLS-enforced via security_invoker';

-- Step 5: Delete invalid jobs (wrong types or bad payloads)
DELETE FROM public.jobs 
WHERE type NOT IN (
  'scan', 
  'update_agent', 
  'report', 
  'config',
  'software_inventory_collect',
  'light_vuln_scan',
  'collect_antivirus_status',
  'collect_web_activity',
  'fix_firewall',
  'restart_service'
);

-- Step 6: Fix scan jobs with wrong payload format (file_path -> filePath)
UPDATE public.jobs
SET payload = jsonb_set(
  payload - 'file_path',
  '{filePath}',
  payload->'file_path'
)
WHERE type = 'scan' 
  AND payload ? 'file_path' 
  AND NOT payload ? 'filePath';