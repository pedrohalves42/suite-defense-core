-- =============================================================================
-- Fix: collect_task_evidence trigger - remove references to non-existent columns
-- =============================================================================

-- Drop existing trigger and function
DROP TRIGGER IF EXISTS tr_collect_task_evidence ON public.tasks;
DROP FUNCTION IF EXISTS public.collect_task_evidence();

-- Recreate simplified trigger function that only uses existing columns
CREATE OR REPLACE FUNCTION public.collect_task_evidence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_source_data jsonb;
BEGIN
  -- Only collect snapshot if source_id exists and task is being created
  IF TG_OP = 'INSERT' AND NEW.source_id IS NOT NULL THEN
    
    -- Collect source snapshot based on source_type
    IF NEW.source_type = 'job' THEN
      SELECT jsonb_build_object(
        'id', j.id,
        'type', j.type,
        'status', j.status,
        'priority', j.priority,
        'created_at', j.created_at,
        'agent_id', j.agent_id
      ) INTO v_source_data 
      FROM jobs j 
      WHERE j.id = NEW.source_id;
      
    ELSIF NEW.source_type = 'system_alert' THEN
      SELECT jsonb_build_object(
        'id', sa.id,
        'alert_type', sa.alert_type,
        'severity', sa.severity,
        'resolved', sa.resolved,
        'created_at', sa.created_at,
        'agent_id', sa.agent_id
      ) INTO v_source_data 
      FROM system_alerts sa 
      WHERE sa.id = NEW.source_id;
      
    ELSIF NEW.source_type = 'insight' THEN
      SELECT jsonb_build_object(
        'id', i.id,
        'insight_type', i.insight_type,
        'severity', i.severity,
        'status', i.status,
        'created_at', i.created_at
      ) INTO v_source_data 
      FROM insights i 
      WHERE i.id = NEW.source_id;
    END IF;
    
    -- Store snapshot in closure_evidence if we got data
    IF v_source_data IS NOT NULL THEN
      NEW.closure_evidence := COALESCE(NEW.closure_evidence, '{}'::jsonb) || 
                             jsonb_build_object('source_snapshot', v_source_data);
    END IF;
    
  END IF;
  
  RETURN NEW;
END;
$$;

-- Recreate trigger on tasks table
CREATE TRIGGER tr_collect_task_evidence
  BEFORE INSERT ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.collect_task_evidence();

-- Add comment documenting the fix
COMMENT ON FUNCTION public.collect_task_evidence() IS 
'Collects source snapshot when task is created. Fixed to use only existing columns in tasks table (no agent_id, related_events, source_snapshot columns).';