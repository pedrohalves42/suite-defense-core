-- Corrigir trigger para usar valores validos de decision_source
CREATE OR REPLACE FUNCTION create_dlq_decision_event()
RETURNS TRIGGER AS $$
DECLARE
  v_tenant_id uuid;
  v_decision_source text;
BEGIN
  -- So processa quando status muda para 'resolved' ou 'failed'
  IF (TG_OP = 'UPDATE' AND NEW.status IN ('resolved', 'failed') AND OLD.status = 'pending') THEN
    v_tenant_id := NEW.tenant_id;
    
    -- Mapear resolution_source para decision_source valido
    -- Valores validos: 'human', 'ai', 'system', 'policy', 'resilience_engine'
    v_decision_source := CASE 
      WHEN NEW.resolution_source = 'auto_cleanup' THEN 'system'
      WHEN NEW.resolution_source = 'human' THEN 'human'
      WHEN NEW.resolution_source = 'ai' THEN 'ai'
      WHEN NEW.resolution_source = 'policy' THEN 'policy'
      WHEN NEW.resolution_source = 'resilience_engine' THEN 'resilience_engine'
      WHEN NEW.resolved_by IS NOT NULL THEN 'human'
      ELSE 'system'
    END;
    
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
        'resolution_source_original', NEW.resolution_source,
        'resolved_by', NEW.resolved_by
      ),
      v_decision_source,
      'system'
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;