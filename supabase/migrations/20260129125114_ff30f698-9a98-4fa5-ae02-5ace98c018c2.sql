-- View para snapshot do agente (fonte unica de verdade)
-- Fase 1.1 do plano unificado - Versao corrigida sem diagnostic_issues
CREATE OR REPLACE VIEW agent_snapshots 
WITH (security_invoker = on) AS
SELECT
  a.id AS agent_id,
  a.tenant_id,
  a.hostname,
  a.os_type,
  a.agent_version AS version,
  a.last_heartbeat,
  (a.last_heartbeat > now() - interval '2 minutes') AS online,
  EXTRACT(epoch FROM (now() - a.last_heartbeat)) * 1000 AS latency_ms,
  a.agent_state,
  COALESCE(a.safe_mode_entered_at IS NOT NULL, false) AS safe_mode,
  a.safe_mode_reason,
  COALESCE(a.is_isolated, false) AS is_isolated,
  COALESCE(a.is_throttled, false) AS is_throttled,
  0::bigint AS active_issues, -- Placeholder, tabela nao existe
  (SELECT COUNT(*) FROM ai_insights ai 
   WHERE ai.agent_id = a.id AND ai.status = 'open') AS unresolved_insights,
  now() AS snapshot_at
FROM agents a
WHERE a.tenant_id = get_active_tenant_id() OR is_current_super_admin();

-- RPC segura para obter snapshot de um agente especifico
CREATE OR REPLACE FUNCTION get_agent_snapshot(p_agent_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT to_jsonb(s)
  FROM agent_snapshots s
  WHERE s.agent_id = p_agent_id;
$$;

-- Grant access
GRANT EXECUTE ON FUNCTION get_agent_snapshot(uuid) TO authenticated;