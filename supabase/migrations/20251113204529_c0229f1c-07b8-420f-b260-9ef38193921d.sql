-- ✅ FASE 2: Criar função RPC para buscar agentes problemáticos
CREATE OR REPLACE FUNCTION public.get_problematic_agents()
RETURNS TABLE (
  id uuid,
  agent_name text,
  status text,
  created_at timestamptz,
  minutes_since_creation numeric,
  installation_success boolean,
  network_connectivity boolean,
  metadata jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.id,
    a.agent_name,
    a.status,
    a.created_at,
    EXTRACT(EPOCH FROM (NOW() - a.created_at))::numeric / 60 as minutes_since_creation,
    ia.success as installation_success,
    ia.network_connectivity,
    ia.metadata
  FROM agents a
  LEFT JOIN LATERAL (
    SELECT success, network_connectivity, metadata
    FROM installation_analytics
    WHERE agent_id = a.id
      AND event_type = 'post_installation'
    ORDER BY created_at DESC
    LIMIT 1
  ) ia ON true
  WHERE a.status = 'pending'
    AND a.last_heartbeat IS NULL
    AND a.created_at < NOW() - INTERVAL '5 minutes'
  ORDER BY a.created_at DESC;
END;
$$;