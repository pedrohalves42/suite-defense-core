-- =============================================================================
-- Fix: collect_task_evidence trigger - handle dlq gracefully (table may not exist)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.collect_task_evidence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source_data jsonb;
BEGIN
  -- Apenas coleta snapshot em INSERT com source_id presente
  IF TG_OP = 'INSERT' AND NEW.source_id IS NOT NULL THEN
    
    CASE NEW.source_type
      WHEN 'job' THEN
        SELECT jsonb_build_object(
          'id', j.id,
          'type', j.type,
          'status', j.status,
          'priority', j.priority,
          'created_at', j.created_at,
          'completed_at', j.completed_at
        ) INTO v_source_data 
        FROM jobs j WHERE j.id = NEW.source_id;
        
      WHEN 'system_alert' THEN
        SELECT jsonb_build_object(
          'id', sa.id,
          'alert_type', sa.alert_type,
          'severity', sa.severity,
          'message', sa.message,
          'resolved', sa.resolved,
          'created_at', sa.created_at
        ) INTO v_source_data 
        FROM system_alerts sa WHERE sa.id = NEW.source_id;
        
      WHEN 'ai_insight' THEN
        SELECT jsonb_build_object(
          'id', i.id,
          'insight_type', i.insight_type,
          'severity', i.severity,
          'title', i.title,
          'status', i.status,
          'created_at', i.created_at
        ) INTO v_source_data 
        FROM ai_insights i WHERE i.id = NEW.source_id;
        
      WHEN 'dlq' THEN
        -- DLQ table may not exist - store minimal metadata
        v_source_data := jsonb_build_object(
          'source_type', 'dlq',
          'source_id', NEW.source_id,
          'note', 'DLQ source - table not available'
        );
        
      ELSE
        v_source_data := NULL;
    END CASE;
    
    -- Armazena snapshot em closure_evidence
    IF v_source_data IS NOT NULL THEN
      NEW.closure_evidence := COALESCE(NEW.closure_evidence, '{}'::jsonb) || 
                             jsonb_build_object('source_snapshot', v_source_data);
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.collect_task_evidence() IS 
'Trigger function to collect source evidence on task creation. Handles job, system_alert, ai_insight, and dlq source types. DLQ handled gracefully if table does not exist.';