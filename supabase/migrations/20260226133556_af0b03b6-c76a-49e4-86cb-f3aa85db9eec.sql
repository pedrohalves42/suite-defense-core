
-- Atualizar a função auto_mark_agents_inactive para usar threshold de 10 minutos
-- Isso alinha o backend com o frontend que usa 5 min como threshold visual
CREATE OR REPLACE FUNCTION public.auto_mark_agents_inactive()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  v_threshold interval := '10 minutes';
  v_cutoff timestamptz := now() - v_threshold;
  v_result jsonb;
BEGIN
  -- Mark agents as offline if no heartbeat for > 10 minutes
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
  
  -- Log to cron health
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

-- Aumentar frequência do cron: de cada 30 min para cada 5 min
SELECT cron.unschedule(90);
SELECT cron.schedule(
  'auto-mark-agents-offline',
  '*/5 * * * *',
  'SELECT public.auto_mark_agents_inactive()'
);

-- Marcar imediatamente os que estão sem heartbeat há mais de 10 min
UPDATE agents
SET 
  status = 'offline',
  agent_state = 'offline',
  agent_state_changed_at = now(),
  agent_state_reason = 'Auto-marked offline: no heartbeat for >10 minutes'
WHERE status = 'active'
  AND last_heartbeat IS NOT NULL
  AND last_heartbeat < now() - interval '10 minutes';
