-- Corrigir o trigger create_decision_event_from_alert incluindo action
CREATE OR REPLACE FUNCTION public.create_decision_event_from_alert()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- So criar evento se o alerta foi resolvido
  IF NEW.resolved = true AND (OLD.resolved = false OR OLD.resolved IS NULL) THEN
    INSERT INTO decision_events (
      tenant_id,
      decision_type,
      actor_type,
      actor_id,
      rule_code,
      action,
      evidence,
      justification,
      human_reviewed,
      created_at
    ) VALUES (
      NEW.tenant_id,
      'alert_resolution',
      CASE 
        WHEN NEW.resolved_by IS NOT NULL THEN 'user'
        ELSE 'system'
      END,
      COALESCE(NEW.resolved_by, '00000000-0000-0000-0000-000000000000'),
      'ALERT_RESOLVED',
      'resolve_alert',
      jsonb_build_object(
        'alert_id', NEW.id,
        'alert_type', NEW.alert_type,
        'severity', NEW.severity,
        'message', NEW.message,
        'resolved_at', NEW.resolved_at,
        'trigger_source', 'database_trigger'
      ),
      COALESCE(NEW.resolution_notes, 'Alert resolved'),
      NEW.resolved_by IS NOT NULL,
      COALESCE(NEW.resolved_at, now())
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;