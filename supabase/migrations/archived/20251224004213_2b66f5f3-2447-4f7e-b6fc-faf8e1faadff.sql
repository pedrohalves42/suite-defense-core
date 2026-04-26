-- ============================================================
-- P0 CRITICAL FIXES: v_job_execution_health + agent_signing_keys
-- ============================================================

-- 1. Corrigir view v_job_execution_health (bug logico na contagem de duplicatas)
DROP VIEW IF EXISTS v_job_execution_health;

CREATE OR REPLACE VIEW v_job_execution_health 
WITH (security_invoker = true) AS
SELECT 
  j.tenant_id,
  COUNT(*) FILTER (WHERE j.status = 'delivered') as delivered_count,
  COUNT(*) FILTER (WHERE j.status = 'completed') as completed_count,
  COUNT(*) FILTER (WHERE j.status = 'failed') as failed_count,
  COUNT(*) FILTER (WHERE j.status = 'completed' AND j.finished_at > j.expires_at) as expired_completed_count,
  -- FIX: Contagem correta de jobs com execucoes duplicadas
  COUNT(*) FILTER (
    WHERE j.id IN (
      SELECT je2.job_id
      FROM job_executions je2
      GROUP BY je2.job_id
      HAVING COUNT(*) > 1
    )
  ) AS duplicate_execution_jobs,
  AVG(EXTRACT(EPOCH FROM (j.delivered_at - j.created_at))) as avg_queue_time_seconds,
  AVG(je.execution_time_seconds) FILTER (WHERE j.status = 'completed') as avg_execution_time_seconds,
  NOW() as calculated_at
FROM jobs j
LEFT JOIN job_executions je ON j.current_execution_id = je.id
WHERE j.created_at > NOW() - INTERVAL '24 hours'
GROUP BY j.tenant_id;

-- 2. Criar tabela agent_signing_keys para rotacao de chaves (N + N-1)
CREATE TABLE IF NOT EXISTS agent_signing_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  public_key TEXT NOT NULL,
  key_fingerprint TEXT NOT NULL,
  version INT NOT NULL DEFAULT 1,
  algorithm TEXT NOT NULL DEFAULT 'ECDSA-P256-SHA256',
  valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  revoked_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Unique: apenas uma chave por versao por agente
  UNIQUE(agent_id, version)
);

-- 3. Indices para performance
CREATE INDEX IF NOT EXISTS idx_agent_signing_keys_agent_id ON agent_signing_keys(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_signing_keys_fingerprint ON agent_signing_keys(key_fingerprint);
CREATE INDEX IF NOT EXISTS idx_agent_signing_keys_valid ON agent_signing_keys(agent_id, revoked_at) WHERE revoked_at IS NULL;

-- 4. RLS para agent_signing_keys
ALTER TABLE agent_signing_keys ENABLE ROW LEVEL SECURITY;

-- Admins podem ver chaves dos agentes do seu tenant
CREATE POLICY "Admins can view agent signing keys in their tenant"
  ON agent_signing_keys FOR SELECT
  USING (agent_id IN (
    SELECT a.id FROM agents a 
    WHERE a.tenant_id IN (
      SELECT tenant_id FROM user_roles WHERE user_id = auth.uid()
    )
  ));

-- Service role pode inserir novas chaves
CREATE POLICY "Service role can insert signing keys"
  ON agent_signing_keys FOR INSERT
  WITH CHECK (true);

-- Service role pode revogar chaves (apenas setar revoked_at)
CREATE POLICY "Service role can revoke signing keys"
  ON agent_signing_keys FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- 5. Funcao para buscar chave valida (aceita N ou N-1)
CREATE OR REPLACE FUNCTION get_valid_agent_signing_key(
  p_agent_id UUID,
  p_fingerprint TEXT
)
RETURNS TABLE (
  key_id UUID,
  public_key TEXT,
  version INT,
  algorithm TEXT,
  is_current BOOLEAN
) AS $$
DECLARE
  v_max_version INT;
BEGIN
  -- Buscar versao maxima ativa do agente
  SELECT COALESCE(MAX(ask.version), 0) INTO v_max_version
  FROM agent_signing_keys ask
  WHERE ask.agent_id = p_agent_id 
    AND ask.revoked_at IS NULL;
  
  RETURN QUERY
  SELECT 
    ask.id as key_id,
    ask.public_key,
    ask.version,
    ask.algorithm,
    (ask.version = v_max_version) as is_current
  FROM agent_signing_keys ask
  WHERE ask.agent_id = p_agent_id
    AND ask.key_fingerprint = p_fingerprint
    AND ask.revoked_at IS NULL
    -- Aceitar N (atual) e N-1 (anterior) para rotacao sem downtime
    AND ask.version >= GREATEST(v_max_version - 1, 1)
  ORDER BY ask.version DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 6. Funcao para registrar nova chave do agente
CREATE OR REPLACE FUNCTION register_agent_signing_key(
  p_agent_id UUID,
  p_public_key TEXT,
  p_fingerprint TEXT,
  p_algorithm TEXT DEFAULT 'ECDSA-P256-SHA256'
)
RETURNS TABLE (
  key_id UUID,
  version INT,
  valid_from TIMESTAMPTZ
) AS $$
DECLARE
  v_new_version INT;
  v_key_id UUID;
  v_valid_from TIMESTAMPTZ;
BEGIN
  -- Calcular proxima versao
  SELECT COALESCE(MAX(ask.version), 0) + 1 INTO v_new_version
  FROM agent_signing_keys ask
  WHERE ask.agent_id = p_agent_id;
  
  v_valid_from := NOW();
  
  -- Inserir nova chave
  INSERT INTO agent_signing_keys (
    agent_id,
    public_key,
    key_fingerprint,
    version,
    algorithm,
    valid_from
  ) VALUES (
    p_agent_id,
    p_public_key,
    p_fingerprint,
    v_new_version,
    p_algorithm,
    v_valid_from
  )
  RETURNING id INTO v_key_id;
  
  -- Atualizar campos legados na tabela agents (compatibilidade)
  UPDATE agents
  SET 
    result_public_key = p_public_key,
    result_key_fingerprint = p_fingerprint,
    result_key_registered_at = v_valid_from
  WHERE id = p_agent_id;
  
  RETURN QUERY SELECT v_key_id, v_new_version, v_valid_from;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 7. Funcao para revogar chave especifica
CREATE OR REPLACE FUNCTION revoke_agent_signing_key(
  p_key_id UUID,
  p_reason TEXT DEFAULT 'manual_revocation'
)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE agent_signing_keys
  SET 
    revoked_at = NOW(),
    revoked_reason = p_reason
  WHERE id = p_key_id
    AND revoked_at IS NULL;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 8. Trigger para prevenir modificacao de chaves (exceto revogacao)
CREATE OR REPLACE FUNCTION prevent_signing_key_modification()
RETURNS TRIGGER AS $$
BEGIN
  -- Permitir apenas setar revoked_at e revoked_reason
  IF OLD.public_key != NEW.public_key 
     OR OLD.key_fingerprint != NEW.key_fingerprint
     OR OLD.agent_id != NEW.agent_id
     OR OLD.version != NEW.version
     OR OLD.algorithm != NEW.algorithm
     OR OLD.valid_from != NEW.valid_from THEN
    RAISE EXCEPTION 'IMMUTABLE_VIOLATION: Signing key fields cannot be modified. Key: %', OLD.id
      USING ERRCODE = '23514';
  END IF;
  
  -- Nao permitir "des-revogar" uma chave
  IF OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS NULL THEN
    RAISE EXCEPTION 'IMMUTABLE_VIOLATION: Cannot unrevoke a signing key. Key: %', OLD.id
      USING ERRCODE = '23514';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER enforce_signing_key_immutability
  BEFORE UPDATE ON agent_signing_keys
  FOR EACH ROW
  EXECUTE FUNCTION prevent_signing_key_modification();

-- 9. Trigger para bloquear DELETE em chaves (auditoria)
CREATE OR REPLACE FUNCTION prevent_signing_key_deletion()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'IMMUTABLE_VIOLATION: Signing keys cannot be deleted, only revoked. Key: %', OLD.id
    USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER block_signing_key_deletion
  BEFORE DELETE ON agent_signing_keys
  FOR EACH ROW
  EXECUTE FUNCTION prevent_signing_key_deletion();