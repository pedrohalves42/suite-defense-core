-- Drop existing function to recreate with parameter
DROP FUNCTION IF EXISTS get_agents_snapshots_list();

-- RPC CORRIGIDA com parametro tenant_id explicito
CREATE OR REPLACE FUNCTION get_agents_snapshots_list(p_tenant_id uuid DEFAULT NULL)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT to_jsonb(s) 
  FROM agent_snapshots s
  WHERE s.tenant_id = COALESCE(p_tenant_id, get_active_tenant_id())
     OR is_current_super_admin();
$$;

-- Seguranca: Revogar publico, conceder apenas autenticados
REVOKE ALL ON FUNCTION get_agents_snapshots_list(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_agents_snapshots_list(uuid) TO authenticated;