
-- =============================================================================
-- AUDITORIA POS-REMEDIACAO: Correcao de 3 problemas encontrados
-- =============================================================================

-- FIX 1: Atualizar constraint de event_type para incluir tipos gerados por triggers
ALTER TABLE public.agent_evidence_logs DROP CONSTRAINT IF EXISTS agent_evidence_logs_event_type_check;
ALTER TABLE public.agent_evidence_logs ADD CONSTRAINT agent_evidence_logs_event_type_check 
  CHECK (event_type = ANY (ARRAY[
    'state_change', 'job_execution', 'dns_block', 'policy_sync', 
    'auto_recovery', 'heartbeat', 'update_applied', 'update_check', 
    'error', 'policy_drift', 'security_event', 'security_warning', 
    'metrics_sent', 'force_update',
    'execution_completed', 'execution_failed'  -- novos tipos do trigger
  ]));

-- FIX 2: Revogar EXECUTE das trigger functions para anon
REVOKE EXECUTE ON FUNCTION public.auto_create_evidence_from_execution() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.auto_evaluate_playbook_on_alert() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.auto_provision_signing_key() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.emit_agent_status_domain_event() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.emit_alert_domain_event() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.emit_job_domain_event() FROM anon, public;

-- FIX 3: Corrigir trigger de evidence para usar event_type valido
CREATE OR REPLACE FUNCTION public.auto_create_evidence_from_execution()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IN ('completed', 'failed') THEN
    INSERT INTO public.agent_evidence_logs (
      agent_id, agent_name, tenant_id, event_type, 
      event_data, evidence_hash, severity
    )
    SELECT 
      NEW.agent_id,
      COALESCE(a.hostname, a.name, 'unknown'),
      a.tenant_id,
      CASE WHEN NEW.status = 'completed' THEN 'job_execution' ELSE 'error' END,
      jsonb_build_object(
        'execution_id', NEW.id,
        'job_id', NEW.job_id,
        'status', NEW.status,
        'started_at', NEW.started_at,
        'completed_at', NEW.completed_at
      ),
      encode(sha256(convert_to(NEW.id::text || NEW.status || now()::text, 'UTF8')), 'hex'),
      CASE WHEN NEW.status = 'completed' THEN 'info' ELSE 'warning' END
    FROM public.agents a
    WHERE a.id = NEW.agent_id;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW; -- never block the parent operation
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- FIX 3b: Corrigir trigger de playbook para nao violar NOT NULL em system_alerts
CREATE OR REPLACE FUNCTION public.auto_evaluate_playbook_on_alert()
RETURNS TRIGGER AS $$
DECLARE
  v_playbook RECORD;
BEGIN
  IF NEW.severity IN ('critical', 'high') THEN
    FOR v_playbook IN
      SELECT id, name FROM public.soar_playbooks
      WHERE is_active = true
      AND tenant_id = NEW.tenant_id
      AND (
        trigger_conditions::text ILIKE '%' || NEW.alert_type || '%'
        OR trigger_conditions::text ILIKE '%' || COALESCE(NEW.title, '') || '%'
      )
      LIMIT 3
    LOOP
      INSERT INTO public.playbook_executions (
        playbook_id, tenant_id, triggered_by, trigger_source,
        status, execution_context
      ) VALUES (
        v_playbook.id, NEW.tenant_id, 'system', 'auto_trigger',
        'pending', jsonb_build_object(
          'alert_id', NEW.id,
          'alert_type', NEW.alert_type,
          'severity', NEW.severity,
          'title', NEW.title
        )
      );
    END LOOP;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
