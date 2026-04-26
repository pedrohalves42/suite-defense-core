
-- Fix SOAR trigger: remove the self-referencing UPDATE (dedup already handled by trg_deduplicate_system_alert)
-- The UPDATE on system_alerts inside an AFTER INSERT trigger on system_alerts causes recursive trigger issues
CREATE OR REPLACE FUNCTION public.soar_evaluate_alert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_playbook RECORD;
  v_trigger_type text;
BEGIN
  v_trigger_type := CASE NEW.alert_type
    WHEN 'vulnerability_critical' THEN 'vulnerability_critical'
    WHEN 'antivirus_outdated' THEN 'antivirus_outdated'
    WHEN 'certificate_expiring' THEN 'certificate_expiring'
    WHEN 'usb_device_risky' THEN 'usb_device_risky'
    WHEN 'process_suspicious' THEN 'process_suspicious'
    WHEN 'behavioral_anomaly' THEN 'behavioral_anomaly'
    WHEN 'agent_compromised' THEN 'behavioral_anomaly'
    WHEN 'ai_insight_alert' THEN 'behavioral_anomaly'
    WHEN 'firewall_disabled' THEN 'antivirus_outdated'
    WHEN 'antivirus_inactive' THEN 'antivirus_outdated'
    WHEN 'agent_long_offline' THEN 'behavioral_anomaly'
    ELSE NULL
  END;

  IF v_trigger_type IS NULL THEN RETURN NEW; END IF;

  -- Match playbook: tenant-specific first, then global (NULL tenant_id)
  SELECT * INTO v_playbook FROM soar_playbooks
  WHERE trigger_type = v_trigger_type AND is_active = true
    AND (tenant_id = NEW.tenant_id OR tenant_id IS NULL)
    AND (last_triggered_at IS NULL OR last_triggered_at < NOW() - (cooldown_minutes || ' minutes')::interval)
  ORDER BY CASE WHEN tenant_id = NEW.tenant_id THEN 0 ELSE 1 END
  LIMIT 1;

  IF v_playbook IS NOT NULL THEN
    INSERT INTO soar_executions (
      id, tenant_id, playbook_id, trigger_type, agent_id, status, actions_taken, started_at, created_at
    ) VALUES (
      gen_random_uuid(), NEW.tenant_id, v_playbook.id, v_trigger_type, NEW.agent_id,
      CASE WHEN v_playbook.auto_execute AND NOT v_playbook.requires_approval THEN 'running' ELSE 'pending_approval' END,
      v_playbook.actions, NOW(), NOW()
    );
    UPDATE soar_playbooks SET last_triggered_at = NOW(), execution_count = execution_count + 1 WHERE id = v_playbook.id;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block alert creation due to SOAR errors
  RAISE WARNING 'SOAR trigger error: %', SQLERRM;
  RETURN NEW;
END;
$function$;
