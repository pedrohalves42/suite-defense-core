-- Fix type mismatch causing "operator does not exist: uuid = text" on ai_insights acknowledge
-- The trigger sync_task_on_insight_resolution() compares tasks.source_id (uuid) to NEW.id::text (text)
-- Replace comparisons to use uuid on both sides.

CREATE OR REPLACE FUNCTION public.sync_task_on_insight_resolution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Mark task as resolved
  IF NEW.status = 'resolved'
     AND COALESCE(OLD.status, '') <> 'resolved' THEN
    UPDATE tasks
    SET
      status = 'resolved',
      closed_at = COALESCE(NEW.resolved_at, now()),
      closed_by = NEW.resolved_by,
      closure_reason = COALESCE(NEW.final_outcome, 'Resolved via AI Insight'),
      updated_at = now()
    WHERE
      source_type = 'ai_insight'
      AND source_id = NEW.id
      AND status <> 'resolved';
  END IF;

  -- Mark task as in_progress on acknowledge
  IF NEW.acknowledged = true
     AND COALESCE(OLD.acknowledged, false) = false THEN
    UPDATE tasks
    SET
      status = 'in_progress',
      updated_at = now()
    WHERE
      source_type = 'ai_insight'
      AND source_id = NEW.id
      AND status = 'open';
  END IF;

  RETURN NEW;
END;
$function$;
