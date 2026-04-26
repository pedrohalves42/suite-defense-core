
-- =====================================================
-- FASE 3 & 4: Triggers e Funcoes Possiveis
-- =====================================================

-- Ciclo 15: Auto Collect Evidence (tasks table)
CREATE OR REPLACE FUNCTION public.auto_collect_task_evidence()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- When task moves to in_progress, log evidence collection
  IF NEW.status = 'in_progress' AND OLD.status = 'open' THEN
    INSERT INTO audit_log (tenant_id, action, actor_id, actor_type, details)
    VALUES (
      NEW.tenant_id,
      'evidence_collection_triggered',
      NULL,
      'system',
      jsonb_build_object(
        'task_id', NEW.id,
        'task_title', NEW.title,
        'source_type', NEW.source_type,
        'fingerprint_id', NEW.fingerprint_id
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_auto_collect_evidence ON public.tasks;
CREATE TRIGGER tr_auto_collect_evidence
AFTER UPDATE OF status ON public.tasks
FOR EACH ROW
WHEN (OLD.status = 'open' AND NEW.status = 'in_progress')
EXECUTE FUNCTION public.auto_collect_task_evidence();

-- Ciclo 16: Verify Audit Log Integrity
CREATE OR REPLACE FUNCTION public.verify_audit_log_integrity()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total integer;
  v_with_hash integer;
  v_broken integer;
BEGIN
  SELECT COUNT(*) INTO v_total FROM audit_log;
  SELECT COUNT(*) INTO v_with_hash FROM audit_log WHERE hash IS NOT NULL;
  
  SELECT COUNT(*) INTO v_broken
  FROM audit_log a1
  WHERE a1.previous_hash IS NOT NULL 
    AND NOT EXISTS (SELECT 1 FROM audit_log a2 WHERE a2.hash = a1.previous_hash);

  RETURN jsonb_build_object(
    'total_entries', v_total,
    'entries_with_hash', v_with_hash,
    'broken_chains', v_broken,
    'status', CASE WHEN v_broken = 0 THEN 'healthy' ELSE 'broken' END,
    'checked_at', now()
  );
END;
$$;

-- Ciclo 22: Safe Mode Alert via agent_safe_mode_events table
CREATE OR REPLACE FUNCTION public.generate_safe_mode_alert_from_event()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- When safe mode event is created, generate alert
  INSERT INTO system_alerts (
    tenant_id,
    alert_type,
    severity,
    title,
    message,
    agent_id,
    acknowledged
  ) VALUES (
    NEW.tenant_id,
    'safe_mode_activated',
    'high',
    'Agente em Safe Mode',
    format('Agente entrou em modo de seguranca. Razao: %s', COALESCE(NEW.reason, 'Nao especificada')),
    NEW.agent_id,
    false
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_safe_mode_alert ON public.agent_safe_mode_events;
CREATE TRIGGER tr_safe_mode_alert
AFTER INSERT ON public.agent_safe_mode_events
FOR EACH ROW
EXECUTE FUNCTION public.generate_safe_mode_alert_from_event();
