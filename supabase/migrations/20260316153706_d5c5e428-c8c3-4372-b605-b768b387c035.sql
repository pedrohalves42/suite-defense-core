
-- RPC: handle_archived_agent_heartbeat
-- If archived < 15 days: auto-reactivate + alert (info)
-- If archived >= 15 days: stay archived + alert (warning, requires manual approval)
CREATE OR REPLACE FUNCTION public.handle_archived_agent_heartbeat(
  p_agent_id uuid,
  p_tenant_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agent RECORD;
  v_days_archived integer;
  v_action text;
  v_alert_severity text;
  v_alert_title text;
  v_alert_message text;
  v_requires_decision boolean;
BEGIN
  SELECT id, agent_name, hostname, agent_state, archived_at, tenant_id
  INTO v_agent
  FROM agents
  WHERE id = p_agent_id AND tenant_id = p_tenant_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('action', 'ignored', 'reason', 'agent_not_found');
  END IF;

  IF v_agent.agent_state != 'archived' AND v_agent.archived_at IS NULL THEN
    RETURN jsonb_build_object('action', 'ignored', 'reason', 'agent_not_archived');
  END IF;

  v_days_archived := EXTRACT(DAY FROM (now() - COALESCE(v_agent.archived_at, now())))::integer;

  IF v_days_archived < 15 THEN
    UPDATE agents
    SET agent_state = 'active',
        status = 'online',
        archived_at = NULL,
        archived_reason = NULL,
        agent_state_reason = 'Auto-reativado via heartbeat após ' || v_days_archived || ' dias arquivado',
        agent_state_changed_at = now(),
        last_heartbeat = now()
    WHERE id = p_agent_id AND tenant_id = p_tenant_id;

    v_action := 'reactivated';
    v_alert_severity := 'info';
    v_alert_title := 'Agente reativado automaticamente';
    v_alert_message := format(
      'O agente "%s" (%s) foi reativado automaticamente após enviar heartbeat. Estava arquivado há %s dias.',
      v_agent.agent_name, COALESCE(v_agent.hostname, 'N/A'), v_days_archived
    );
    v_requires_decision := false;
  ELSE
    v_action := 'alert_only';
    v_alert_severity := 'warning';
    v_alert_title := 'Heartbeat de agente arquivado (requer aprovação)';
    v_alert_message := format(
      'O agente "%s" (%s) enviou heartbeat mas está arquivado há %s dias. Reativação requer aprovação manual.',
      v_agent.agent_name, COALESCE(v_agent.hostname, 'N/A'), v_days_archived
    );
    v_requires_decision := true;
  END IF;

  INSERT INTO system_alerts (
    tenant_id, agent_id, alert_type, severity, title, message,
    details, requires_human_decision, source, status
  ) VALUES (
    p_tenant_id, p_agent_id, 'archived_agent_heartbeat', v_alert_severity,
    v_alert_title, v_alert_message,
    jsonb_build_object(
      'days_archived', v_days_archived,
      'action_taken', v_action,
      'agent_name', v_agent.agent_name,
      'hostname', v_agent.hostname
    ),
    v_requires_decision, 'heartbeat_monitor', 'open'
  );

  RETURN jsonb_build_object(
    'action', v_action,
    'days_archived', v_days_archived,
    'agent_name', v_agent.agent_name
  );
END;
$$;
