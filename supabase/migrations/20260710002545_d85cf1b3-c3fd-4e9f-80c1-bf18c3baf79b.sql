-- P0-02 · Heartbeat alignment
-- Aligns thresholds with backlog rule: alert <= 3 * heartbeat interval.
-- Companion of supabase/functions/_shared/agent-lifecycle/heartbeat-thresholds.ts.

-- 1. Recreate auto_mark_agents_inactive with canonical 3-minute threshold
--    and doc that matches the code.
CREATE OR REPLACE FUNCTION public.auto_mark_agents_inactive()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count integer := 0;
  v_threshold interval := '3 minutes';  -- 3 * heartbeat_interval (60s)
  v_cutoff timestamptz := now() - v_threshold;
  v_result jsonb;
BEGIN
  UPDATE agents
  SET
    status = 'offline',
    agent_state = 'offline',
    agent_state_changed_at = now(),
    agent_state_reason = format('Auto-marked offline: no heartbeat for >%s', v_threshold)
  WHERE status = 'active'
    AND last_heartbeat IS NOT NULL
    AND last_heartbeat < v_cutoff;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  v_result := jsonb_build_object(
    'success', true,
    'agents_marked_offline', v_count,
    'threshold', v_threshold::text,
    'cutoff_time', v_cutoff,
    'executed_at', now()
  );

  INSERT INTO cron_health_checks (cron_name, last_success_at, consecutive_failures, updated_at, last_result)
  VALUES ('auto-mark-inactive', now(), 0, now(), v_result)
  ON CONFLICT (cron_name) DO UPDATE SET
    last_success_at = now(),
    consecutive_failures = 0,
    last_error = NULL,
    updated_at = now(),
    last_result = EXCLUDED.last_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.auto_mark_agents_inactive() IS
  'P0-02: Marks agents as offline when last_heartbeat is older than 3 minutes (3x the 60s heartbeat interval). Should be called by cron every 1 minute.';

-- 2. Short-offline alert: fires once per agent when offline > 3 minutes,
--    dedup by (agent_id, alert_type, resolved=false).
CREATE OR REPLACE FUNCTION public.alert_short_offline_agents()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_agent RECORD;
  v_count integer := 0;
  v_existing integer;
  v_threshold interval := '3 minutes';
BEGIN
  PERFORM _assert_service_role_or_super_admin();

  FOR v_agent IN
    SELECT id, agent_name, tenant_id, last_heartbeat,
      EXTRACT(EPOCH FROM (NOW() - last_heartbeat)) / 60 AS minutes_offline
    FROM agents
    WHERE status = 'offline'
      AND last_heartbeat IS NOT NULL
      AND last_heartbeat < NOW() - v_threshold
      AND last_heartbeat > NOW() - interval '48 hours'  -- leave >48h to the long alert
  LOOP
    SELECT COUNT(*) INTO v_existing
    FROM system_alerts
    WHERE agent_id = v_agent.id
      AND alert_type = 'agent_short_offline'
      AND resolved = false;

    IF v_existing = 0 THEN
      INSERT INTO system_alerts (
        tenant_id, agent_id, alert_type, severity, title, message, details, source
      ) VALUES (
        v_agent.tenant_id, v_agent.id, 'agent_short_offline', 'medium',
        'Agente offline: ' || v_agent.agent_name,
        'O agente ' || v_agent.agent_name || ' está sem heartbeat há ' ||
          ROUND(v_agent.minutes_offline::numeric, 1) || ' minutos (limite: 3 min).',
        jsonb_build_object(
          'agent_name', v_agent.agent_name,
          'minutes_offline', ROUND(v_agent.minutes_offline::numeric, 1),
          'last_heartbeat', v_agent.last_heartbeat,
          'threshold_seconds', 180
        ),
        'system'
      );
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('alerts_created', v_count, 'threshold', v_threshold::text);
END;
$$;

COMMENT ON FUNCTION public.alert_short_offline_agents() IS
  'P0-02: Emits medium-severity alert for agents offline > 3 minutes (3x heartbeat). Dedup by (agent_id, alert_type, resolved=false). Escalation to long-offline is handled by alert_long_offline_agents() at 48h.';