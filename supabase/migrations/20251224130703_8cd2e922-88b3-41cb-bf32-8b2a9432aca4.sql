-- =====================================================
-- P2.1: Atualizar finalize_job_execution para limpar current_execution_id
-- P2.2: Atualizar claim_jobs_for_agent para definir started_at
-- =====================================================

-- P2.2: Atualizar claim_jobs_for_agent para incluir started_at = NOW()
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
    -- P2.2: Incluir started_at = NOW() no momento do claim
    INSERT INTO job_executions (
      job_id,
      agent_id,
      tenant_id,
      agent_version,
      agent_name,
      payload_hash,
      nonce,
      status,
      claimed_at,
      started_at  -- P2.2: Preencher no claim
    ) VALUES (
      v_job.id,
      p_agent_id,
      p_tenant_id,
      v_agent_version,
      p_agent_name,
      v_payload_hash,
      v_nonce,
      'claimed',
      NOW(),
      NOW()  -- P2.2: started_at = NOW() no momento do claim
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

-- P2.1: Atualizar finalize_job_execution para limpar current_execution_id
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
    started_at = COALESCE(p_started_at, v_execution.started_at, v_execution.claimed_at),
    finished_at = COALESCE(p_finished_at, NOW()),
    output_hash = p_output_hash,
    error_message = p_error_message,
    execution_time_seconds = p_execution_time_seconds,
    result_signature = p_result_signature,
    signature_verified = p_signature_verified
  WHERE id = v_execution.id;
  
  -- P2.1: CRITICO - Limpar current_execution_id do job para liberar para retry
  UPDATE jobs
  SET current_execution_id = NULL
  WHERE id = p_job_id
    AND current_execution_id = v_execution.id;
  
  RETURN jsonb_build_object(
    'success', true,
    'execution_id', v_execution.id,
    'job_id', p_job_id,
    'status', p_status,
    'execution_cleared', true  -- P2.1: Confirmar que limpou
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;