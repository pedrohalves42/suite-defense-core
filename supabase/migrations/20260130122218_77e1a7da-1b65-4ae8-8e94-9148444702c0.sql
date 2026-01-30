-- RPC para detectar agentes que estão com heartbeat atrasado (stale)
-- Útil para monitoramento e alertas automáticos
CREATE OR REPLACE FUNCTION get_stale_agents(
  p_tenant_id uuid,
  p_threshold_minutes int DEFAULT 30
)
RETURNS TABLE (
  agent_id uuid,
  agent_name text,
  display_name text,
  hostname text,
  last_heartbeat timestamptz,
  minutes_since_heartbeat numeric,
  agent_version text,
  status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    id,
    agent_name,
    display_name,
    hostname,
    last_heartbeat,
    ROUND(EXTRACT(EPOCH FROM (NOW() - last_heartbeat))/60, 1) as minutes_since_heartbeat,
    agent_version,
    status
  FROM agents
  WHERE tenant_id = p_tenant_id
    AND archived_at IS NULL
    AND status = 'active'
    AND last_heartbeat IS NOT NULL
    AND last_heartbeat < NOW() - (p_threshold_minutes || ' minutes')::interval
  ORDER BY last_heartbeat ASC;
$$;

-- Comentário para documentação
COMMENT ON FUNCTION get_stale_agents IS 'Retorna agentes cujo heartbeat está atrasado além do threshold especificado (padrão 30 min). Útil para monitoramento e detecção de agentes offline.';

-- Grant para usuários autenticados
GRANT EXECUTE ON FUNCTION get_stale_agents(uuid, int) TO authenticated;