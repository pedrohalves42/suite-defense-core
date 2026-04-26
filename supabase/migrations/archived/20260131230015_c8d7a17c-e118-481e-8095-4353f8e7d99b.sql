-- ============================================================================
-- V-610 FIX: Trigger DLQ com RETURNING para atribuir decision_event_id
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_dlq_decision_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant_id uuid;
  v_decision_source text;
  v_event_id uuid;
BEGIN
  -- So processa quando status muda para 'resolved' ou 'failed'
  IF (TG_OP = 'UPDATE' AND NEW.status IN ('resolved', 'failed') AND OLD.status = 'pending') THEN
    v_tenant_id := NEW.tenant_id;
    
    -- Mapear resolution_source para decision_source valido
    v_decision_source := CASE 
      WHEN NEW.resolution_source = 'auto_cleanup' THEN 'system'
      WHEN NEW.resolution_source = 'human' THEN 'human'
      WHEN NEW.resolution_source = 'ai' THEN 'ai'
      WHEN NEW.resolution_source = 'policy' THEN 'policy'
      WHEN NEW.resolution_source = 'resilience_engine' THEN 'resilience_engine'
      WHEN NEW.resolved_by IS NOT NULL THEN 'human'
      ELSE 'system'
    END;
    
    -- V-610 FIX: Usar RETURNING para capturar o ID gerado
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
    ) RETURNING id INTO v_event_id;
    
    -- V-610 FIX: Atribuir o ID ao registro DLQ
    NEW.decision_event_id := v_event_id;
  END IF;
  
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.create_dlq_decision_event() IS 
  'ADR-026/V-603/V-610: Trigger com search_path fixo e RETURNING para atribuir decision_event_id.';

-- ============================================================================
-- V-609 FIX: Adicionar filtro explicito de tenant em v_risk_debt_summary
-- ============================================================================

DROP VIEW IF EXISTS v_risk_debt_summary;
CREATE VIEW v_risk_debt_summary 
WITH (security_invoker = on) AS
SELECT 
    tenant_id,
    count(*) AS total_active,
    count(*) FILTER (WHERE severity = 'critical') AS critical_count,
    count(*) FILTER (WHERE severity = 'high') AS high_count,
    count(*) FILTER (WHERE expires_at IS NOT NULL AND expires_at < (now() + '7 days'::interval)) AS expiring_soon
FROM v_risk_debt_active
WHERE (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin())
GROUP BY tenant_id;

COMMENT ON VIEW v_risk_debt_summary IS 
  'ADR-026/V-609: Tenant-isolated risk debt summary com filtro EXPLICITO. Nao depende apenas de heranca.';

GRANT SELECT ON v_risk_debt_summary TO authenticated;