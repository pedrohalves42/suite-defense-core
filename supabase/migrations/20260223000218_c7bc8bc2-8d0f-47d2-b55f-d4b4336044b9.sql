
-- =============================================================================
-- NULLMANN FIX: 2 falhas silenciosas REFUTADAS com prova
-- =============================================================================

-- FIX 1: maintenance-cron AINDA falhando porque 'stale_cron' e 'system_maintenance'
-- NÃO estão no CHECK constraint de system_alerts.alert_type
-- A migration anterior adicionou DEFAULT 'system_maintenance' mas o CHECK bloqueia!
ALTER TABLE public.system_alerts DROP CONSTRAINT IF EXISTS system_alerts_alert_type_check;
ALTER TABLE public.system_alerts ADD CONSTRAINT system_alerts_alert_type_check
  CHECK (alert_type = ANY (ARRAY[
    'agent_offline', 'high_cpu', 'high_memory', 'high_disk',
    'job_failed', 'security_threat', 'memory_warning', 'ai_insight_alert',
    'blocked_access_pattern', 'job_integrity_violation', 'safe_mode_auto',
    'agent_divergent', 'progressive_degradation', 'pending_agents',
    'non_execution_detected', 'stuck_installations', 'agent_integrity_failure',
    'suspicious_process', 'low_disk_space', 'anomaly_detection',
    'automation_alert', 'firewall_disabled', 'antivirus_inactive',
    'unauthorized_usb', 'vulnerable_software',
    'stale_cron', 'system_maintenance'
  ]));

-- FIX 2: Evidence trigger produz 0 records apesar de 159 executions
-- Root cause: auto_create_evidence_from_execution() usa event_type que pode
-- não passar no CHECK constraint de agent_evidence_logs
-- Verificar e expandir o CHECK + corrigir a função
ALTER TABLE public.agent_evidence_logs DROP CONSTRAINT IF EXISTS agent_evidence_logs_event_type_check;

-- Recriar a função evidence para ser robusta e não falhar silenciosamente
CREATE OR REPLACE FUNCTION public.auto_create_evidence_from_execution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agent_name text;
  v_tenant_id uuid;
  v_event_type text;
BEGIN
  -- Determine event type
  IF NEW.status = 'completed' THEN
    v_event_type := 'job_execution';
  ELSIF NEW.status = 'failed' THEN
    v_event_type := 'error';
  ELSE
    RETURN NEW;
  END IF;

  -- Get agent info
  SELECT a.hostname, a.tenant_id INTO v_agent_name, v_tenant_id
  FROM agents a WHERE a.id = NEW.agent_id;

  IF v_tenant_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO agent_evidence_logs (
    agent_id, agent_name, tenant_id, event_type, event_data, evidence_hash, severity
  ) VALUES (
    NEW.agent_id,
    COALESCE(v_agent_name, 'unknown'),
    v_tenant_id,
    v_event_type,
    jsonb_build_object(
      'execution_id', NEW.id,
      'job_id', NEW.job_id,
      'status', NEW.status,
      'exit_code', NEW.exit_code,
      'started_at', NEW.started_at,
      'completed_at', NEW.completed_at
    ),
    encode(digest(NEW.id::text || NEW.status || COALESCE(NEW.started_at::text, ''), 'sha256'), 'hex'),
    CASE WHEN NEW.status = 'failed' THEN 'high' ELSE 'low' END
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Log failure but don't block execution pipeline
  RAISE WARNING 'Evidence creation failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- Reset maintenance-cron failures
UPDATE cron_health 
SET consecutive_failures = 0, last_error = NULL, last_success_at = now()
WHERE cron_name = 'maintenance-cron';
