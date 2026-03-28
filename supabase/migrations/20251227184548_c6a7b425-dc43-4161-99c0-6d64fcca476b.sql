-- =============================================================
-- FECHAMENTO DO LOOP: AUTO_REVERT_THROTTLE_006
-- =============================================================

-- 1?? RPC: detect_throttle_revert_candidates
-- Detecta agentes que podem ter o throttle removido com seguranca
CREATE OR REPLACE FUNCTION public.detect_throttle_revert_candidates()
RETURNS TABLE (
  agent_id uuid,
  agent_name text,
  tenant_id uuid,
  throttled_at timestamptz,
  minutes_since_execution numeric,
  pending_jobs bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id AS agent_id,
    a.agent_name,
    a.tenant_id,
    a.throttled_at,
    v.minutes_since_execution,
    v.pending_jobs
  FROM agents a
  JOIN v_agent_execution_health v ON v.agent_id = a.id
  WHERE
    -- Esta throttled
    a.is_throttled = true
    -- Cooldown minimo (2h desde o throttle)
    AND a.throttled_at < NOW() - INTERVAL '2 hours'
    -- Voltou a executar recentemente (menos de 15min sem execucao)
    AND v.minutes_since_execution < 15
    -- Backlog sob controle
    AND v.pending_jobs < 5
    -- Anti-flap: nao foi throttled recentemente de novo
    AND NOT EXISTS (
      SELECT 1
      FROM decision_events de
      WHERE de.agent_id = a.id
        AND de.rule_code = 'AGENT_IMPRODUTIVE_005'
        AND de.created_at > NOW() - INTERVAL '2 hours'
    )
    -- Nunca interferir com SAFE_MODE
    AND v.health_status != 'safe_mode';
END;
$$;

-- 2?? Ativar regra AUTO_REVERT_THROTTLE_006
UPDATE public.decision_rules
SET is_enabled = true
WHERE code = 'AUTO_REVERT_THROTTLE_006';