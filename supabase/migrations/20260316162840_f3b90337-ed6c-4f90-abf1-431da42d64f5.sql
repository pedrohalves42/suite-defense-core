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
  FROM public.agents
  WHERE id = p_agent_id
    AND tenant_id = p_tenant_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('action', 'ignored', 'reason', 'agent_not_found');
  END IF;

  IF COALESCE(v_agent.archived_at IS NOT NULL, false) = false THEN
    RETURN jsonb_build_object('action', 'ignored', 'reason', 'agent_not_archived');
  END IF;

  v_days_archived := FLOOR(EXTRACT(EPOCH FROM (now() - v_agent.archived_at)) / 86400)::integer;

  IF v_days_archived < 15 THEN
    UPDATE public.agents
    SET agent_state = 'healthy',
        status = 'active',
        archived_at = NULL,
        archived_reason = NULL,
        agent_state_reason = 'Auto-reativado via heartbeat apos ' || v_days_archived || ' dias arquivado',
        agent_state_changed_at = now(),
        last_heartbeat = now()
    WHERE id = p_agent_id
      AND tenant_id = p_tenant_id;

    v_action := 'reactivated';
    v_alert_severity := 'medium';
    v_alert_title := 'Agente reativado automaticamente';
    v_alert_message := format(
      'O agente "%s" (%s) foi reativado automaticamente apos enviar heartbeat. Estava arquivado ha %s dias.',
      v_agent.agent_name,
      COALESCE(v_agent.hostname, 'N/A'),
      v_days_archived
    );
    v_requires_decision := false;
  ELSE
    v_action := 'alert_only';
    v_alert_severity := 'high';
    v_alert_title := 'Heartbeat de agente arquivado requer aprovacao';
    v_alert_message := format(
      'O agente "%s" (%s) enviou heartbeat, mas esta arquivado ha %s dias. Reativacao requer aprovacao manual.',
      v_agent.agent_name,
      COALESCE(v_agent.hostname, 'N/A'),
      v_days_archived
    );
    v_requires_decision := true;
  END IF;

  INSERT INTO public.system_alerts (
    tenant_id,
    agent_id,
    alert_type,
    severity,
    title,
    message,
    details,
    requires_human_decision,
    source,
    status,
    resolved
  ) VALUES (
    p_tenant_id,
    p_agent_id,
    'automation_alert',
    v_alert_severity,
    v_alert_title,
    v_alert_message,
    jsonb_build_object(
      'category', 'archived_agent_heartbeat',
      'days_archived', v_days_archived,
      'action_taken', v_action,
      'agent_name', v_agent.agent_name,
      'hostname', v_agent.hostname
    ),
    v_requires_decision,
    'heartbeat_monitor',
    'active',
    false
  );

  RETURN jsonb_build_object(
    'action', v_action,
    'days_archived', v_days_archived,
    'agent_name', v_agent.agent_name
  );
END;
$$;