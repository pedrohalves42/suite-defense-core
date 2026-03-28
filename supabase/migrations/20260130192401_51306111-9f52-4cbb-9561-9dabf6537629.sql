-- Corrigir trigger para usar decision_type valido
CREATE OR REPLACE FUNCTION public.create_dlq_decision_event()
RETURNS TRIGGER AS $$
DECLARE
  v_tenant_id uuid;
  v_decision_id uuid;
BEGIN
  -- So criar evento quando status muda para 'resolved'
  IF NEW.status = 'resolved' AND (OLD IS NULL OR OLD.status != 'resolved') THEN
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
      'system'  -- Valor valido no constraint
    ) RETURNING id INTO v_decision_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;