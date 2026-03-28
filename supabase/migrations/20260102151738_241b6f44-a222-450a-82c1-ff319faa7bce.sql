
-- Funcao para sincronizar status dos agentes baseado no heartbeat
CREATE OR REPLACE FUNCTION sync_agent_status_from_heartbeat()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  offline_threshold INTERVAL := INTERVAL '2 minutes';
  updated_count INTEGER := 0;
BEGIN
  -- Marcar como offline agentes sem heartbeat ha mais de 2 minutos
  UPDATE agents
  SET 
    status = 'offline',
    offline_detected_at = COALESCE(offline_detected_at, NOW()),
    offline_reason = COALESCE(offline_reason, 'Sem heartbeat por mais de 2 minutos')
  WHERE 
    status = 'active'
    AND archived_at IS NULL
    AND (
      last_heartbeat IS NULL 
      OR last_heartbeat < NOW() - offline_threshold
    );
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  IF updated_count > 0 THEN
    RAISE NOTICE 'Marked % agents as offline', updated_count;
  END IF;
  
  -- Marcar como active agentes com heartbeat recente
  UPDATE agents
  SET 
    status = 'active',
    offline_detected_at = NULL,
    offline_reason = NULL
  WHERE 
    status = 'offline'
    AND archived_at IS NULL
    AND last_heartbeat IS NOT NULL
    AND last_heartbeat >= NOW() - offline_threshold;
    
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  IF updated_count > 0 THEN
    RAISE NOTICE 'Marked % agents as active', updated_count;
  END IF;
END;
$$;

-- Comentario explicativo
COMMENT ON FUNCTION sync_agent_status_from_heartbeat() IS 'Sincroniza o status dos agentes baseado no last_heartbeat. Agentes sem heartbeat ha mais de 2 minutos sao marcados como offline.';
