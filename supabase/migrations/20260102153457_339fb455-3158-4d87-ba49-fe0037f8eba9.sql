-- Funcao para sincronizar status de agentes pending que nao enviam heartbeat
-- Marca como offline agentes pending que foram enrolled ha mais de 10 minutos sem heartbeat

CREATE OR REPLACE FUNCTION sync_pending_agents_status()
RETURNS TABLE (
  agent_id UUID,
  agent_name TEXT,
  old_status TEXT,
  new_status TEXT,
  minutes_since_enrollment INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH updated AS (
    UPDATE agents
    SET 
      status = 'offline',
      offline_reason = 'never_connected'
    WHERE 
      status = 'pending'
      AND last_heartbeat IS NULL
      AND enrolled_at IS NOT NULL
      AND enrolled_at < NOW() - INTERVAL '10 minutes'
      AND archived_at IS NULL
    RETURNING 
      id,
      agents.agent_name,
      'pending'::TEXT AS old_status,
      'offline'::TEXT AS new_status,
      EXTRACT(EPOCH FROM (NOW() - enrolled_at))::INT / 60 AS minutes_since_enrollment
  )
  SELECT 
    updated.id AS agent_id,
    updated.agent_name,
    updated.old_status,
    updated.new_status,
    updated.minutes_since_enrollment
  FROM updated;
END;
$$;

-- Comentario explicativo
COMMENT ON FUNCTION sync_pending_agents_status() IS 
'Atualiza automaticamente o status de agentes pending para offline se nao enviaram heartbeat em 10 minutos apos enrollment';