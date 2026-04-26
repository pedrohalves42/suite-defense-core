
-- Restore EXCEPTION handler now that SOAR is validated
CREATE OR REPLACE FUNCTION public.soar_evaluate_alert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_playbook RECORD;
  v_trigger_type text;
  v_execution_id uuid;
BEGIN
  v_trigger_type := CASE NEW.alert_type
    WHEN 'vulnerability_critical' THEN 'vulnerability_critical'
    WHEN 'antivirus_outdated' THEN 'antivirus_outdated'
    WHEN 'antivirus_inactive' THEN 'antivirus_outdated'
    WHEN 'firewall_disabled' THEN 'antivirus_outdated'
    WHEN 'certificate_expiring' THEN 'certificate_expiring'
    WHEN 'usb_device_risky' THEN 'usb_device_risky'
    WHEN 'process_suspicious' THEN 'process_suspicious'
    WHEN 'behavioral_anomaly' THEN 'behavioral_anomaly'
    WHEN 'agent_compromised' THEN 'behavioral_anomaly'
    WHEN 'ai_insight_alert' THEN 'behavioral_anomaly'
    WHEN 'agent_long_offline' THEN 'behavioral_anomaly'
    WHEN 'automation_alert' THEN 'process_suspicious'
    WHEN 'network_anomaly' THEN 'network_anomaly'
    WHEN 'file_integrity_violation' THEN 'file_integrity_violation'
    WHEN 'stale_cron' THEN 'behavioral_anomaly'
    WHEN 'vulnerable_software' THEN 'vulnerability_critical'
    WHEN 'unauthorized_usb' THEN 'usb_device_risky'
    ELSE NULL
  END;

  IF v_trigger_type IS NULL THEN RETURN NEW; END IF;

  SELECT * INTO v_playbook FROM soar_playbooks
  WHERE trigger_type = v_trigger_type AND is_active = true
    AND (tenant_id = NEW.tenant_id OR tenant_id IS NULL)
    AND (last_triggered_at IS NULL OR last_triggered_at < NOW() - (cooldown_minutes || ' minutes')::interval)
  ORDER BY CASE WHEN tenant_id = NEW.tenant_id THEN 0 ELSE 1 END
  LIMIT 1;

  IF v_playbook IS NULL THEN RETURN NEW; END IF;

  v_execution_id := gen_random_uuid();

  INSERT INTO soar_executions (
    id, tenant_id, playbook_id, trigger_type, agent_id, status, actions_taken, started_at, created_at
  ) VALUES (
    v_execution_id, NEW.tenant_id, v_playbook.id, v_trigger_type, NEW.agent_id,
    CASE 
      WHEN v_playbook.auto_execute AND NOT v_playbook.requires_approval THEN 'completed'
      WHEN v_playbook.auto_approve_critical AND NEW.severity = 'critical' THEN 'completed'
      ELSE 'pending_approval' 
    END,
    v_playbook.actions, NOW(), NOW()
  );

  UPDATE soar_playbooks 
  SET last_triggered_at = NOW(), execution_count = COALESCE(execution_count, 0) + 1 
  WHERE id = v_playbook.id;

  IF (v_playbook.auto_execute AND NOT v_playbook.requires_approval) OR
     (v_playbook.auto_approve_critical AND NEW.severity = 'critical') THEN
    UPDATE soar_executions SET completed_at = NOW() WHERE id = v_execution_id;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'SOAR trigger error for alert %: % (SQLSTATE: %)', NEW.id, SQLERRM, SQLSTATE;
  RETURN NEW;
END;
$$;
