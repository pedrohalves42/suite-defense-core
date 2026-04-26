-- =====================================================
-- REFINEMENT: Production-grade triggers
-- - Triggers por colunas especificas (evita updates desnecessarios)
-- - Idempotencia nas atualizacoes (AND status <> 'resolved')
-- - COALESCE pattern para seguranca
-- =====================================================

-- AI INSIGHTS trigger (refinado com column specificity)
CREATE OR REPLACE FUNCTION public.sync_task_on_insight_resolution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
      AND source_id = NEW.id::text
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
      AND source_id = NEW.id::text
      AND status = 'open';
  END IF;

  RETURN NEW;
END;
$$;

-- Recreate trigger with column specificity
DROP TRIGGER IF EXISTS tr_sync_task_insight ON ai_insights;
CREATE TRIGGER tr_sync_task_insight
AFTER UPDATE OF status, acknowledged
ON ai_insights
FOR EACH ROW
EXECUTE FUNCTION sync_task_on_insight_resolution();

-- SYSTEM ALERTS trigger (refinado com column specificity)
CREATE OR REPLACE FUNCTION public.sync_task_on_alert_resolution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.resolved = true
     AND COALESCE(OLD.resolved, false) = false THEN
    UPDATE tasks
    SET
      status = 'resolved',
      closed_at = COALESCE(NEW.resolved_at, now()),
      closed_by = NEW.resolved_by,
      closure_reason = NEW.resolution_notes,
      updated_at = now()
    WHERE
      source_type = 'system_alert'
      AND source_id = NEW.id::text
      AND status <> 'resolved';
  END IF;

  RETURN NEW;
END;
$$;

-- Recreate trigger with column specificity
DROP TRIGGER IF EXISTS tr_sync_task_alert ON system_alerts;
CREATE TRIGGER tr_sync_task_alert
AFTER UPDATE OF resolved
ON system_alerts
FOR EACH ROW
EXECUTE FUNCTION sync_task_on_alert_resolution();