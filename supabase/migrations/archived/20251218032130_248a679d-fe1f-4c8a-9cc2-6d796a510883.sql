-- RPC para buscar jobs recentes do tenant (resolve RLS silencioso)
CREATE OR REPLACE FUNCTION get_recent_jobs(p_tenant_id uuid, p_limit integer DEFAULT 50)
RETURNS SETOF jobs
LANGUAGE sql
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT *
  FROM jobs
  WHERE tenant_id = p_tenant_id
  ORDER BY created_at DESC
  LIMIT p_limit;
$$;

-- Grant execute para authenticated users
GRANT EXECUTE ON FUNCTION get_recent_jobs(uuid, integer) TO authenticated;