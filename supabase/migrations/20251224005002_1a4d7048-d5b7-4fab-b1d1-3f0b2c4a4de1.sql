-- ============================================================
-- P1: RPC para buscar todas as chaves validas de um agente (N e N-1)
-- Usada pela verificacao de assinatura
-- ============================================================

CREATE OR REPLACE FUNCTION get_valid_agent_signing_key_by_agent(p_agent_id UUID)
RETURNS TABLE (
  key_id UUID,
  public_key TEXT,
  version INT,
  algorithm TEXT,
  is_current BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max_version INT;
BEGIN
  -- Buscar versao maxima nao-revogada do agente
  SELECT COALESCE(MAX(ask.version), 0) INTO v_max_version
  FROM agent_signing_keys ask
  WHERE ask.agent_id = p_agent_id 
    AND ask.revoked_at IS NULL;
  
  -- Retornar chaves N e N-1 (para suportar rotacao)
  RETURN QUERY
  SELECT 
    ask.id as key_id,
    ask.public_key,
    ask.version,
    ask.algorithm,
    (ask.version = v_max_version) as is_current
  FROM agent_signing_keys ask
  WHERE ask.agent_id = p_agent_id
    AND ask.revoked_at IS NULL
    -- Aceitar N (atual) e N-1 (anterior) para rotacao sem downtime
    AND ask.version >= GREATEST(v_max_version - 1, 1)
  ORDER BY ask.version DESC;
END;
$$;

-- Comentario explicativo
COMMENT ON FUNCTION get_valid_agent_signing_key_by_agent IS 
'Returns all valid signing keys (N and N-1) for an agent to support key rotation without downtime';