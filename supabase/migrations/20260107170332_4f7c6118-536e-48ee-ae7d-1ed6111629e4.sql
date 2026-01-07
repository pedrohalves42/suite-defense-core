-- Fix: "record 'new' has no field 'status'" error
-- Problem: sync_task_on_source_resolution() uses NEW.status but system_alerts uses 'resolved' column
-- Solution: Create separate functions for each table

-- Drop existing combined function and triggers first
DROP TRIGGER IF EXISTS tr_sync_task_on_source_resolution ON ai_insights;
DROP TRIGGER IF EXISTS tr_sync_task_on_source_resolution ON system_alerts;
DROP TRIGGER IF EXISTS tr_sync_task_insight ON ai_insights;
DROP TRIGGER IF EXISTS tr_sync_task_alert ON system_alerts;

-- Function for ai_insights table
CREATE OR REPLACE FUNCTION public.sync_task_on_insight_resolution()
RETURNS trigger 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public
AS $$
BEGIN
  -- When ai_insight is resolved
  IF NEW.status = 'resolved' AND (OLD.status IS NULL OR OLD.status != 'resolved') THEN
    UPDATE tasks SET 
      status = 'resolved',
      closed_at = COALESCE(NEW.resolved_at, now()),
      closed_by = NEW.resolved_by,
      closure_reason = COALESCE(NEW.final_outcome, 'Resolved via AI Insight'),
      updated_at = now()
    WHERE source_type = 'ai_insight' AND source_id = NEW.id::text;
  END IF;
  
  -- When acknowledged (mark in progress)
  IF NEW.acknowledged = true AND (OLD.acknowledged IS NULL OR OLD.acknowledged = false) THEN
    UPDATE tasks SET 
      status = 'in_progress',
      updated_at = now()
    WHERE source_type = 'ai_insight' AND source_id = NEW.id::text AND status = 'open';
  END IF;
  
  RETURN NEW;
END;
$$;

-- Function for system_alerts table
CREATE OR REPLACE FUNCTION public.sync_task_on_alert_resolution()
RETURNS trigger 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public
AS $$
BEGIN
  -- When system_alert is resolved
  IF NEW.resolved = true AND (OLD.resolved IS NULL OR OLD.resolved = false) THEN
    UPDATE tasks SET 
      status = 'resolved',
      closed_at = COALESCE(NEW.resolved_at, now()),
      closed_by = NEW.resolved_by,
      closure_reason = NEW.resolution_notes,
      updated_at = now()
    WHERE source_type = 'system_alert' AND source_id = NEW.id::text;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for ai_insights
CREATE TRIGGER tr_sync_task_insight
  AFTER UPDATE ON ai_insights
  FOR EACH ROW
  EXECUTE FUNCTION sync_task_on_insight_resolution();

-- Create trigger for system_alerts
CREATE TRIGGER tr_sync_task_alert
  AFTER UPDATE ON system_alerts
  FOR EACH ROW
  EXECUTE FUNCTION sync_task_on_alert_resolution();

-- Add comments
COMMENT ON FUNCTION public.sync_task_on_insight_resolution() IS 'Syncs task status when AI insight status changes (resolved/acknowledged)';
COMMENT ON FUNCTION public.sync_task_on_alert_resolution() IS 'Syncs task status when system alert is resolved';