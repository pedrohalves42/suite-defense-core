-- ADR-030: Corrigir Type Mismatch em Triggers de Alertas/Tasks
-- Remove ::text casts para permitir comparacao UUID direta

-- Corrigir auto_create_task_for_critical_alert
CREATE OR REPLACE FUNCTION public.auto_create_task_for_critical_alert()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.severity IN ('critical', 'high') THEN
    INSERT INTO public.tasks (
      tenant_id, source_type, source_id, title, description, 
      severity, status, requires_human_review, auto_generated
    )
    SELECT 
      NEW.tenant_id,
      'system_alert',
      NEW.id,  -- UUID direto, sem ::text
      'Alerta: ' || COALESCE(NEW.alert_type, 'Sistema'),
      COALESCE(NEW.message, 'Alerta de sistema requer atencao'),
      NEW.severity,
      'open',
      NEW.severity = 'critical',
      true
    WHERE NOT EXISTS (
      SELECT 1 FROM public.tasks t 
      WHERE t.source_type = 'system_alert' 
        AND t.source_id = NEW.id  -- UUID = UUID
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Corrigir sync_task_on_alert_resolution
CREATE OR REPLACE FUNCTION public.sync_task_on_alert_resolution()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.resolved = true
     AND COALESCE(OLD.resolved, false) = false THEN
    UPDATE public.tasks
    SET
      status = 'resolved',
      closed_at = COALESCE(NEW.resolved_at, now()),
      closed_by = NEW.resolved_by,
      closure_reason = NEW.resolution_notes,
      updated_at = now()
    WHERE
      source_type = 'system_alert'
      AND source_id = NEW.id  -- UUID = UUID, sem ::text
      AND status <> 'resolved';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;