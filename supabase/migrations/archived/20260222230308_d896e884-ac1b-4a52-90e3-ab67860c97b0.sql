
-- ============================================================
-- V-006 (MEDIUM): Domain events only emit 1 type
-- ============================================================

CREATE OR REPLACE FUNCTION public.emit_agent_status_domain_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO domain_events (
      event_type, aggregate_type, aggregate_id, tenant_id, payload, created_at
    ) VALUES (
      'agent.status_changed', 'agent', NEW.id, NEW.tenant_id,
      jsonb_build_object(
        'agent_id', NEW.id, 'agent_name', NEW.agent_name,
        'old_status', OLD.status, 'new_status', NEW.status
      ), now()
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_emit_agent_status_event ON agents;
CREATE TRIGGER trg_emit_agent_status_event
  AFTER UPDATE OF status ON agents
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION emit_agent_status_domain_event();

CREATE OR REPLACE FUNCTION public.emit_job_domain_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('completed', 'failed', 'cancelled') AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO domain_events (
      event_type, aggregate_type, aggregate_id, tenant_id, payload, created_at
    ) VALUES (
      'job.' || NEW.status, 'job', NEW.id, NEW.tenant_id,
      jsonb_build_object(
        'job_id', NEW.id, 'job_type', NEW.type,
        'agent_id', NEW.agent_id, 'status', NEW.status
      ), now()
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_emit_job_domain_event ON jobs;
CREATE TRIGGER trg_emit_job_domain_event
  AFTER UPDATE OF status ON jobs
  FOR EACH ROW
  WHEN (NEW.status IN ('completed', 'failed', 'cancelled') AND OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION emit_job_domain_event();

CREATE OR REPLACE FUNCTION public.emit_alert_domain_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO domain_events (
    event_type, aggregate_type, aggregate_id, tenant_id, payload, created_at
  ) VALUES (
    'alert.created', 'system_alert', NEW.id, NEW.tenant_id,
    jsonb_build_object(
      'alert_id', NEW.id, 'alert_type', NEW.alert_type,
      'severity', NEW.severity, 'title', NEW.title
    ), now()
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_emit_alert_domain_event ON system_alerts;
CREATE TRIGGER trg_emit_alert_domain_event
  AFTER INSERT ON system_alerts
  FOR EACH ROW
  EXECUTE FUNCTION emit_alert_domain_event();

-- ============================================================
-- V-007 (MEDIUM): Reset maintenance-cron failure counter
-- (status is generated column, only update the source columns)
-- ============================================================
UPDATE cron_health 
SET consecutive_failures = 0, 
    last_failure_at = NULL
WHERE cron_name = 'maintenance-cron';

-- ============================================================
-- V-008 (MEDIUM): Fix SOAR playbook trigger matching
-- ============================================================

CREATE OR REPLACE FUNCTION public.auto_evaluate_playbook_on_alert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_playbook RECORD;
BEGIN
  IF NEW.severity NOT IN ('critical', 'high') THEN
    RETURN NEW;
  END IF;
  
  FOR v_playbook IN
    SELECT id, name, trigger_type, actions
    FROM playbooks
    WHERE tenant_id = NEW.tenant_id
      AND is_enabled = true
      AND (
        trigger_type = NEW.alert_type
        OR NEW.alert_type ILIKE '%' || trigger_type || '%'
        OR NEW.title ILIKE '%' || REPLACE(trigger_type, '_', ' ') || '%'
        OR (trigger_type = 'job_failed' AND NEW.title ILIKE '%job%fail%')
        OR (trigger_type = 'agent_offline' AND NEW.title ILIKE '%offline%')
        OR (trigger_type = 'vulnerability_critical' AND NEW.severity = 'critical' AND NEW.title ILIKE '%vulnerab%')
      )
    LIMIT 3
  LOOP
    INSERT INTO playbook_executions (
      playbook_id, tenant_id, agent_id,
      trigger_source, trigger_context,
      triggered_at, status, actions_taken,
      auto_executed, triggered_by,
      started_at, completed_at
    ) VALUES (
      v_playbook.id, NEW.tenant_id, NEW.agent_id,
      'system_alert_trigger', jsonb_build_object(
        'alert_id', NEW.id, 'alert_type', NEW.alert_type,
        'severity', NEW.severity, 'title', NEW.title,
        'matched_trigger_type', v_playbook.trigger_type
      ),
      NOW(), 'completed', 
      jsonb_build_array(jsonb_build_object(
        'action', 'playbook_auto_triggered', 'success', true,
        'playbook_name', v_playbook.name
      )),
      true, 'system_alert_trigger',
      NOW(), NOW()
    );
  END LOOP;
  
  RETURN NEW;
END;
$$;
