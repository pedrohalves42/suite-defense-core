-- Add optimized partial index for SLA breach checking
CREATE INDEX IF NOT EXISTS idx_tasks_sla_monitoring 
ON public.tasks (tenant_id, status, due_at) 
WHERE (status IN ('open', 'in_progress') AND sla_breached_at IS NULL);

-- Update RPC function for efficiency
CREATE OR REPLACE FUNCTION public.check_task_sla_breach()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  breach_count int;
BEGIN
  -- We use a CTE to explicitly target rows matching the index criteria
  WITH targets AS (
    SELECT id 
    FROM public.tasks
    WHERE status IN ('open', 'in_progress')
      AND due_at < now()
      AND sla_breached_at IS NULL
    -- Optimization: only process tasks from the last 30 days to avoid scanning ancient data if it somehow got missed
    -- but still keeping it robust enough for standard operational delays.
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