-- ============================================================
-- JOB EXECUTIONS: Append-Only Audit Trail (Fase 1 + 4)
-- Prova imutavel de cada execucao de job
-- ============================================================

-- 1. Criar tabela job_executions (append-only, imutavel)
CREATE TABLE IF NOT EXISTS job_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  
  -- Contexto da execucao
  agent_version TEXT NOT NULL,
  agent_name TEXT NOT NULL,
  
  -- Prova criptografica
  payload_hash TEXT NOT NULL,  -- SHA256 do payload original
  nonce UUID NOT NULL DEFAULT gen_random_uuid(),
  
  -- Timestamps imutaveis
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  
  -- Resultado
  status TEXT NOT NULL DEFAULT 'claimed' CHECK (status IN ('claimed', 'running', 'completed', 'failed')),
  exit_code INTEGER,
  output_hash TEXT,  -- SHA256 do output (para verificacao)
  error_message TEXT,
  execution_time_seconds INTEGER,
  
  -- Assinatura do resultado pelo agente (preparacao Fase 3)
  result_signature TEXT,
  signature_algorithm TEXT DEFAULT 'ECDSA-P256-SHA256',
  signature_verified BOOLEAN DEFAULT FALSE,
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Constraint: nonce unico por job previne replay
  UNIQUE(job_id, nonce)
);

-- 2. Indices para queries otimizadas
CREATE INDEX IF NOT EXISTS idx_job_executions_job_id ON job_executions(job_id);
CREATE INDEX IF NOT EXISTS idx_job_executions_agent_id ON job_executions(agent_id);
CREATE INDEX IF NOT EXISTS idx_job_executions_tenant_id ON job_executions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_job_executions_status ON job_executions(status);
CREATE INDEX IF NOT EXISTS idx_job_executions_created_at ON job_executions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_executions_payload_hash ON job_executions(payload_hash);

-- 3. RLS: Append-only (INSERT apenas, sem UPDATE/DELETE para usuarios normais)
ALTER TABLE job_executions ENABLE ROW LEVEL SECURITY;

-- Policy para service role inserir executions
CREATE POLICY "Service role can insert executions"
  ON job_executions FOR INSERT
  WITH CHECK (true);

-- Policy para admins visualizarem executions do tenant
CREATE POLICY "Admins can view executions in their tenant"
  ON job_executions FOR SELECT
  USING (tenant_id IN (
    SELECT tenant_id FROM user_roles 
    WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin')
  ));

-- Policy para super admins visualizarem todas
CREATE POLICY "Super admins can view all executions"
  ON job_executions FOR SELECT
  USING (has_role(auth.uid(), 'super_admin'));

-- 4. CRITICO: Permitir UPDATE apenas para finalizacao (status claimed -> completed/failed)
-- Service role pode atualizar para finalizar executions
CREATE POLICY "Service role can finalize executions"
  ON job_executions FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- 5. Adicionar campos para assinatura do resultado na tabela agents (preparacao Fase 3)
ALTER TABLE agents
ADD COLUMN IF NOT EXISTS result_public_key TEXT,
ADD COLUMN IF NOT EXISTS result_key_fingerprint TEXT,
ADD COLUMN IF NOT EXISTS result_key_registered_at TIMESTAMPTZ;

-- 6. Adicionar execution_id na tabela jobs para rastreabilidade
ALTER TABLE jobs
ADD COLUMN IF NOT EXISTS current_execution_id UUID REFERENCES job_executions(id);

-- 7. Atualizar RPC claim_jobs_for_agent para criar executions automaticamente
CREATE OR REPLACE FUNCTION claim_jobs_for_agent(
  p_agent_id UUID,
  p_agent_name TEXT,
  p_tenant_id UUID,
  p_limit INT DEFAULT 10
)
RETURNS TABLE (
  job_id UUID,
  job_type TEXT,
  payload JSONB,
  execution_id UUID,
  nonce UUID,
  payload_hash TEXT,
  expires_at TIMESTAMPTZ
) AS $$
DECLARE
  v_agent_version TEXT;
  v_job RECORD;
  v_execution_id UUID;
  v_nonce UUID;
  v_payload_hash TEXT;
BEGIN
  -- Buscar versao do agente
  SELECT agent_version INTO v_agent_version
  FROM agents
  WHERE id = p_agent_id;
  
  v_agent_version := COALESCE(v_agent_version, 'unknown');
  
  -- Loop atraves dos jobs elegiveis
  FOR v_job IN
    SELECT 
      j.id,
      j.type,
      j.payload,
      j.expires_at
    FROM jobs j
    WHERE j.agent_id = p_agent_id
      AND j.tenant_id = p_tenant_id
      AND j.status = 'queued'
      AND j.approved = true
      AND (j.expires_at IS NULL OR j.expires_at > NOW())
    ORDER BY j.created_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  LOOP
    -- Gerar nonce unico para esta execucao
    v_nonce := gen_random_uuid();
    
    -- Calcular hash do payload
    v_payload_hash := encode(sha256(convert_to(COALESCE(v_job.payload::text, '{}'), 'UTF8')), 'hex');
    
    -- Criar registro de execucao (prova imutavel)
    INSERT INTO job_executions (
      job_id,
      agent_id,
      tenant_id,
      agent_version,
      agent_name,
      payload_hash,
      nonce,
      status,
      claimed_at
    ) VALUES (
      v_job.id,
      p_agent_id,
      p_tenant_id,
      v_agent_version,
      p_agent_name,
      v_payload_hash,
      v_nonce,
      'claimed',
      NOW()
    )
    RETURNING id INTO v_execution_id;
    
    -- Atualizar job para delivered e vincular execution
    UPDATE jobs
    SET 
      status = 'delivered',
      delivered_at = NOW(),
      current_execution_id = v_execution_id
    WHERE id = v_job.id;
    
    -- Retornar job com dados da execucao
    job_id := v_job.id;
    job_type := v_job.type;
    payload := v_job.payload;
    execution_id := v_execution_id;
    nonce := v_nonce;
    payload_hash := v_payload_hash;
    expires_at := v_job.expires_at;
    
    RETURN NEXT;
  END LOOP;
  
  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 8. Funcao para finalizar execution (chamada pelo submit-job-result)
CREATE OR REPLACE FUNCTION finalize_job_execution(
  p_job_id UUID,
  p_execution_id UUID,
  p_agent_id UUID,
  p_status TEXT,
  p_started_at TIMESTAMPTZ DEFAULT NULL,
  p_finished_at TIMESTAMPTZ DEFAULT NULL,
  p_output_hash TEXT DEFAULT NULL,
  p_error_message TEXT DEFAULT NULL,
  p_execution_time_seconds INTEGER DEFAULT NULL,
  p_result_signature TEXT DEFAULT NULL,
  p_signature_verified BOOLEAN DEFAULT FALSE
)
RETURNS JSONB AS $$
DECLARE
  v_execution RECORD;
  v_result JSONB;
BEGIN
  -- Verificar que a execucao existe e pertence ao agente
  SELECT * INTO v_execution
  FROM job_executions
  WHERE id = p_execution_id
    AND job_id = p_job_id
    AND agent_id = p_agent_id
    AND status = 'claimed'
  FOR UPDATE;
  
  IF NOT FOUND THEN
    -- Tentar buscar por job_id se execution_id nao fornecido
    IF p_execution_id IS NULL THEN
      SELECT * INTO v_execution
      FROM job_executions
      WHERE job_id = p_job_id
        AND agent_id = p_agent_id
        AND status = 'claimed'
      ORDER BY claimed_at DESC
      LIMIT 1
      FOR UPDATE;
    END IF;
    
    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Execution not found or already finalized',
        'code', 'EXECUTION_NOT_FOUND'
      );
    END IF;
  END IF;
  
  -- Atualizar execucao com resultado
  UPDATE job_executions
  SET 
    status = p_status,
    started_at = COALESCE(p_started_at, v_execution.started_at),
    finished_at = COALESCE(p_finished_at, NOW()),
    output_hash = p_output_hash,
    error_message = p_error_message,
    execution_time_seconds = p_execution_time_seconds,
    result_signature = p_result_signature,
    signature_verified = p_signature_verified
  WHERE id = v_execution.id;
  
  RETURN jsonb_build_object(
    'success', true,
    'execution_id', v_execution.id,
    'job_id', p_job_id,
    'status', p_status
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 9. View para metricas de saude de jobs (Dashboard)
CREATE OR REPLACE VIEW v_job_execution_health AS
SELECT 
  j.tenant_id,
  COUNT(*) FILTER (WHERE j.status = 'delivered') as delivered_count,
  COUNT(*) FILTER (WHERE j.status = 'completed') as completed_count,
  COUNT(*) FILTER (WHERE j.status = 'failed') as failed_count,
  COUNT(*) FILTER (WHERE j.status = 'completed' AND j.finished_at > j.expires_at) as expired_delivered_count,
  (
    SELECT COUNT(*) 
    FROM job_executions je 
    WHERE je.tenant_id = j.tenant_id 
    GROUP BY je.job_id 
    HAVING COUNT(*) > 1
    LIMIT 1
  ) as has_duplicate_executions,
  AVG(EXTRACT(EPOCH FROM (j.delivered_at - j.created_at))) as avg_queue_time_seconds,
  AVG(je.execution_time_seconds) FILTER (WHERE j.status = 'completed') as avg_execution_time_seconds
FROM jobs j
LEFT JOIN job_executions je ON j.current_execution_id = je.id
WHERE j.created_at > NOW() - INTERVAL '24 hours'
GROUP BY j.tenant_id;

-- 10. Trigger para prevenir modificacao de executions finalizadas
CREATE OR REPLACE FUNCTION prevent_execution_modification()
RETURNS TRIGGER AS $$
BEGIN
  -- Permitir apenas transicoes claimed -> completed/failed
  IF OLD.status IN ('completed', 'failed') THEN
    RAISE EXCEPTION 'IMMUTABLE_VIOLATION: Finalized executions cannot be modified. Execution: %', OLD.id
      USING ERRCODE = '23514';
  END IF;
  
  -- Nao permitir alterar campos imutaveis
  IF NEW.job_id != OLD.job_id 
     OR NEW.agent_id != OLD.agent_id 
     OR NEW.tenant_id != OLD.tenant_id
     OR NEW.payload_hash != OLD.payload_hash
     OR NEW.nonce != OLD.nonce
     OR NEW.claimed_at != OLD.claimed_at THEN
    RAISE EXCEPTION 'IMMUTABLE_VIOLATION: Cannot modify immutable fields on execution: %', OLD.id
      USING ERRCODE = '23514';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER enforce_execution_immutability
  BEFORE UPDATE ON job_executions
  FOR EACH ROW
  EXECUTE FUNCTION prevent_execution_modification();

-- 11. Trigger para bloquear DELETE em executions (append-only)
CREATE OR REPLACE FUNCTION prevent_execution_deletion()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'IMMUTABLE_VIOLATION: Job executions cannot be deleted. Execution: %', OLD.id
    USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER block_execution_deletion
  BEFORE DELETE ON job_executions
  FOR EACH ROW
  EXECUTE FUNCTION prevent_execution_deletion();

-- 12. Funcao para detectar execucoes duplicadas (anomalia)
CREATE OR REPLACE FUNCTION detect_duplicate_executions(p_hours_back INTEGER DEFAULT 24)
RETURNS TABLE (
  job_id UUID,
  execution_count BIGINT,
  agent_name TEXT,
  tenant_id UUID,
  first_claimed_at TIMESTAMPTZ,
  last_claimed_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    je.job_id,
    COUNT(*) as execution_count,
    je.agent_name,
    je.tenant_id,
    MIN(je.claimed_at) as first_claimed_at,
    MAX(je.claimed_at) as last_claimed_at
  FROM job_executions je
  WHERE je.created_at > NOW() - (p_hours_back || ' hours')::INTERVAL
  GROUP BY je.job_id, je.agent_name, je.tenant_id
  HAVING COUNT(*) > 1
  ORDER BY COUNT(*) DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;