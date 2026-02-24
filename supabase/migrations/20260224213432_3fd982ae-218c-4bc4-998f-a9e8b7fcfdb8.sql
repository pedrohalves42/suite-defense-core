
-- =====================================================
-- FIX 1: SOAR - Make playbooks global templates
-- =====================================================
UPDATE soar_playbooks SET tenant_id = NULL WHERE tenant_id = '75fd8eae-57ae-4870-a29b-9ed969d54ed5';

-- =====================================================
-- FIX 2: Fix the SOAR trigger + ALERT DEDUP
-- =====================================================
CREATE OR REPLACE FUNCTION public.soar_evaluate_alert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_playbook RECORD;
  v_trigger_type text;
  v_existing_open int;
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

  -- ALERT DEDUP: auto-resolve older duplicates for same agent+type
  IF NEW.agent_id IS NOT NULL THEN
    UPDATE system_alerts SET resolved = true, resolved_at = NOW(),
      resolution_notes = 'Auto-resolved: superseded by alert ' || NEW.id::text
    WHERE agent_id = NEW.agent_id AND alert_type = NEW.alert_type
      AND resolved = false AND id != NEW.id;
  END IF;

  -- Match playbook: tenant-specific first, then global (NULL)
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
END;
$function$;

-- =====================================================
-- FIX 3: OFFLINE AGENT ALERTING function
-- =====================================================
CREATE OR REPLACE FUNCTION public.alert_long_offline_agents()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_agent RECORD;
  v_count int := 0;
  v_existing int;
BEGIN
  FOR v_agent IN
    SELECT id, agent_name, tenant_id, last_heartbeat,
      EXTRACT(EPOCH FROM (NOW() - last_heartbeat)) / 3600 AS hours_offline
    FROM agents
    WHERE status = 'inactive'
      AND last_heartbeat IS NOT NULL
      AND last_heartbeat < NOW() - interval '48 hours'
  LOOP
    SELECT COUNT(*) INTO v_existing FROM system_alerts
    WHERE agent_id = v_agent.id AND alert_type = 'agent_long_offline' AND resolved = false;

    IF v_existing = 0 THEN
      INSERT INTO system_alerts (
        tenant_id, agent_id, alert_type, severity, title, message, details, source
      ) VALUES (
        v_agent.tenant_id, v_agent.id, 'agent_long_offline', 'high',
        'Agente offline há mais de 48h: ' || v_agent.agent_name,
        'O agente ' || v_agent.agent_name || ' está sem comunicação há ' || ROUND(v_agent.hours_offline::numeric) || ' horas.',
        jsonb_build_object('agent_name', v_agent.agent_name, 'hours_offline', ROUND(v_agent.hours_offline::numeric), 'last_heartbeat', v_agent.last_heartbeat),
        'system'
      );
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('alerts_created', v_count);
END;
$$;

-- =====================================================
-- FIX 4: Update alert_type constraint to include new types
-- =====================================================
DO $$
BEGIN
  ALTER TABLE system_alerts DROP CONSTRAINT IF EXISTS system_alerts_alert_type_check;
  ALTER TABLE system_alerts ADD CONSTRAINT system_alerts_alert_type_check
    CHECK (alert_type IN (
      'stuck_agent', 'stale_cron', 'system_maintenance', 'firewall_disabled',
      'antivirus_inactive', 'unauthorized_usb', 'vulnerable_software',
      'ai_insight_alert', 'automation_alert', 'agent_long_offline',
      'vulnerability_critical', 'antivirus_outdated', 'certificate_expiring',
      'usb_device_risky', 'process_suspicious', 'behavioral_anomaly',
      'agent_compromised', 'security_incident', 'compliance_drift',
      'high_risk_action', 'brute_force_detected', 'trial_expiring'
    ));
END $$;

-- =====================================================
-- FIX 5: Auto-resolve existing duplicate alerts
-- =====================================================
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY agent_id, alert_type 
    ORDER BY created_at DESC
  ) as rn
  FROM system_alerts
  WHERE resolved = false AND agent_id IS NOT NULL
)
UPDATE system_alerts SET resolved = true, resolved_at = NOW(),
  resolution_notes = 'Auto-resolved: duplicate cleanup'
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);
