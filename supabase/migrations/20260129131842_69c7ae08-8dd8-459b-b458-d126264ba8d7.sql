-- RPC para obter lista de snapshots do tenant (Fase 2 do plano)
-- Usa a view agent_snapshots ja existente que tem security_invoker=on

CREATE OR REPLACE FUNCTION get_agents_snapshots_list()
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT to_jsonb(s) FROM agent_snapshots s;
$$;

-- Garantir acesso para usuarios autenticados
GRANT EXECUTE ON FUNCTION get_agents_snapshots_list() TO authenticated;