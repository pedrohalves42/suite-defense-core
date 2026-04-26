-- Corrigir search_path das novas funcoes para seguranca
CREATE OR REPLACE FUNCTION public.enforce_ai_action_approval()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = 'public'
AS $$
BEGIN
  IF NEW.status = 'executed' AND (OLD.status IS NULL OR OLD.status != 'executed') THEN
    IF NEW.risk_level IN ('high', 'critical') AND NEW.approved_at IS NULL THEN
      RAISE EXCEPTION 'AI actions with high/critical risk require formal approval before execution (approved_at must be set)';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.flag_critical_alerts()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = 'public'
AS $$
BEGIN
  IF NEW.severity = 'critical' THEN
    NEW.requires_human_decision := true;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_critical_alert_human_review()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = 'public'
AS $$
BEGIN
  IF NEW.resolved = true AND (OLD.resolved IS NULL OR OLD.resolved = false) THEN
    IF NEW.severity = 'critical' AND NEW.resolved_by IS NULL THEN
      RAISE EXCEPTION 'Critical alerts require human resolution (resolved_by must be set)';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_dlq_decision_event()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = 'public'
AS $$
DECLARE
  v_event_id uuid;
  v_tenant_id uuid;
BEGIN
  IF NEW.status = 'resolved' AND (OLD.status IS NULL OR OLD.status != 'resolved') THEN
    v_tenant_id := NEW.tenant_id;
    
    INSERT INTO public.decision_events (
      tenant_id, 
      rule_code, 
      action, 
      evidence, 
      decision_source, 
      decision_type
    ) VALUES (
      v_tenant_id,
      'DLQ_RESOLUTION',
      'resolve_dlq_item',
      jsonb_build_object(
        'dlq_item_id', NEW.id,
        'original_job_id', NEW.original_job_id,
        'job_type', NEW.job_type,
        'error_message', NEW.error_message,
        'resolution_notes', NEW.resolution_notes,
        'resolved_by', NEW.resolved_by
      ),
      COALESCE(NEW.resolution_source, CASE WHEN NEW.resolved_by IS NOT NULL THEN 'human' ELSE 'system' END),
      'dlq_resolution'
    ) RETURNING id INTO v_event_id;
    
    NEW.decision_event_id := v_event_id;
  END IF;
  RETURN NEW;
END;
$$;