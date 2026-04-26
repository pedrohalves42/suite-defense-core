-- =============================================================
-- AJUSTES OBRIGATORIOS DE SEGURANCA - CAMADA 1
-- Guard-rails anti-loop, lock logico, auto-revert, indices
-- =============================================================

-- 1. Atualizar regra AGENT_IMPRODUTIVE_005 com guard-rails anti-loop
UPDATE public.decision_rules
SET 
  definition = '{
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
    },
    "safety": {
      "max_applications_per_agent_per_day": 3,
      "cooldown_minutes": 120
    }
  }'::jsonb,
  updated_at = NOW()
WHERE code = 'AGENT_IMPRODUTIVE_005';

-- 2. Recriar RPC detect_improdutive_agents com lock logico (evita re-throttle)
CREATE OR REPLACE FUNCTION public.detect_improdutive_agents()
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
  JOIN agents a ON a.id = v.agent_id
  WHERE v.health_status IN ('not_polling_jobs', 'not_executing_jobs', 'execution_stale')
    -- Heartbeat OK (online nos ultimos 30 min)
    AND v.minutes_since_heartbeat < 30
    -- LOCK LOGICO: Nao ja throttled atualmente
    AND COALESCE(a.is_throttled, false) = false
    -- Nao throttled por esta regra nas ultimas 2 horas (cooldown)
    AND NOT EXISTS (
      SELECT 1 FROM decision_events de
      WHERE de.agent_id = v.agent_id
        AND de.rule_code = 'AGENT_IMPRODUTIVE_005'
        AND de.created_at > NOW() - INTERVAL '2 hours'
    )
    -- Nao esta em SAFE_MODE
    AND v.health_status != 'safe_mode'
    -- Tem jobs parados ha mais de 1h OU nao executa ha mais de 2h
    AND (
      v.stale_queued_jobs >= 3
      OR v.minutes_since_execution > 120
    );
END;
$$;

-- 3. Criar regra futura de auto-revert (DESATIVADA)
INSERT INTO public.decision_rules (code, description, scope, definition, is_enabled)
VALUES (
  'AUTO_REVERT_THROTTLE_006',
  'Remove throttle automaticamente apos periodo de resfriamento',
  'agent',
  '{
    "conditions": {
      "is_throttled": true,
      "throttle_older_than_hours": 2
    },
    "actions": ["REMOVE_THROTTLE"],
    "parameters": {
      "check_health_before_revert": true
    }
  }'::jsonb,
  false
)
ON CONFLICT (code) DO NOTHING;

-- 4. Indices defensivos para performance
CREATE INDEX IF NOT EXISTS idx_decision_events_agent_rule_time
ON decision_events (agent_id, rule_code, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agents_is_throttled
ON agents (is_throttled) WHERE is_throttled = true;