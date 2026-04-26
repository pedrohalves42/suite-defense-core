-- =============================================================
-- AGENT_IMPRODUTIVE_005: Throttle automatico de agentes improdutivos
-- =============================================================

-- 1. Criar nova regra de decisao
INSERT INTO public.decision_rules (code, description, scope, definition, is_enabled)
VALUES (
  'AGENT_IMPRODUTIVE_005',
  'Throttle agents with active heartbeat but not processing jobs',
  'agent',
  '{
    "conditions": {
      "heartbeat_ok": true,
      "min_stale_queued_jobs": 3,
      "stale_job_threshold_minutes": 60,
      "min_minutes_since_execution": 120
    },
    "actions": ["THROTTLE"],
    "parameters": {
      "poll_interval_seconds": 300,
      "auto_revert_after_hours": 2
    }
  }'::jsonb,
  true
)
ON CONFLICT (code) DO UPDATE SET
  description = EXCLUDED.description,
  definition = EXCLUDED.definition;

-- 2. Criar RPC para detectar agentes improdutivos
CREATE OR REPLACE FUNCTION detect_improdutive_agents()
RETURNS TABLE (
  agent_id uuid,
  agent_name text,
  tenant_id uuid,
  health_status text,
  minutes_since_heartbeat numeric,
  minutes_since_execution numeric,
  stale_queued_jobs bigint,
  pending_jobs bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    v.agent_id,
    v.agent_name,
    v.tenant_id,
    v.health_status,
    v.minutes_since_heartbeat,
    v.minutes_since_execution,
    v.stale_queued_jobs,
    v.pending_jobs
  FROM v_agent_execution_health v
  -- Agentes com problemas de execucao
  WHERE v.health_status IN ('not_polling_jobs', 'not_executing_jobs', 'execution_stale')
    -- Heartbeat OK (online nos ultimos 30 min)
    AND v.minutes_since_heartbeat < 30
    -- Nao ja throttled por esta regra nas ultimas 2 horas
    AND NOT EXISTS (
      SELECT 1 FROM decision_events de
      WHERE de.agent_id = v.agent_id
        AND de.rule_code = 'AGENT_IMPRODUTIVE_005'
        AND de.created_at > NOW() - INTERVAL '2 hours'
    )
    -- Nao esta em SAFE_MODE (ja tem protecao ativa)
    AND v.health_status != 'safe_mode'
    -- Tem jobs parados ha mais de 1h OU nao executa ha mais de 2h
    AND (
      v.stale_queued_jobs >= 3
      OR v.minutes_since_execution > 120
    );
END;
$$;

-- Grant execute para service role
GRANT EXECUTE ON FUNCTION detect_improdutive_agents() TO service_role;