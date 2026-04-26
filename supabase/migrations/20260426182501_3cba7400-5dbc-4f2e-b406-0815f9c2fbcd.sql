-- Drop old index if it exists (it has tenant_id first, which is bad for global scans)
DROP INDEX IF EXISTS public.idx_tasks_sla_monitoring;

-- Create a more optimized index for global SLA monitoring
-- This version puts (status, due_at) at the front for the cron job to find breached tasks across all tenants instantly.
CREATE INDEX idx_tasks_sla_monitoring 
ON public.tasks (status, due_at) 
WHERE (status = ANY (ARRAY['open'::text, 'in_progress'::text]) AND sla_breached_at IS NULL);

-- Update the function to be even more efficient
CREATE OR REPLACE FUNCTION public.check_task_sla_breach()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  breach_count int;
BEGIN
  -- We explicitly target rows using the partial index criteria
  -- The status filter is already in the index definition, so we match it here.
  WITH targets AS (
    SELECT id 
    FROM public.tasks
    WHERE status IN ('open', 'in_progress')
      AND due_at < now()
      AND sla_breached_at IS NULL
    -- Sliding window: we only check tasks created in the last 30 days.
    -- This prevents performance degradation as the table grows to millions of rows.
    AND created_at > (now() - interval '30 days')
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.tasks
  SET 
    sla_breached_at = now(), 
    updated_at = now()
  FROM targets
  WHERE public.tasks.id = targets.id;
  
  GET DIAGNOSTICS breach_count = ROW_COUNT;
  RETURN breach_count;
END;
$function$;