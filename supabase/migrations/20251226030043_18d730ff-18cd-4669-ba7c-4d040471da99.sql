-- Update finalize_job_execution RPC to accept hash chain fields
CREATE OR REPLACE FUNCTION public.finalize_job_execution(
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
  p_signature_verified BOOLEAN DEFAULT FALSE,
  -- v4.1.9: Hash chain fields
  p_execution_hash TEXT DEFAULT NULL,
  p_previous_execution_hash TEXT DEFAULT NULL,
  p_execution_index BIGINT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
  
  -- Atualizar execucao com resultado e hash chain fields
  UPDATE job_executions
  SET 
    status = p_status,
    started_at = COALESCE(p_started_at, v_execution.started_at, v_execution.claimed_at),
    finished_at = COALESCE(p_finished_at, NOW()),
    output_hash = p_output_hash,
    error_message = p_error_message,
    execution_time_seconds = p_execution_time_seconds,
    result_signature = p_result_signature,
    signature_verified = p_signature_verified,
    -- v4.1.9: Hash chain fields
    execution_hash = COALESCE(p_execution_hash, execution_hash),
    previous_execution_hash = COALESCE(p_previous_execution_hash, previous_execution_hash),
    execution_index = COALESCE(p_execution_index, execution_index)
  WHERE id = v_execution.id;
  
  -- P2.1: CRITICO - Limpar current_execution_id do job para liberar para retry
  UPDATE jobs
  SET current_execution_id = NULL
  WHERE id = p_job_id
    AND current_execution_id = v_execution.id;
  
  -- v4.1.9: Update agent_execution_chain if hash chain was provided
  IF p_execution_hash IS NOT NULL AND p_execution_index IS NOT NULL THEN
    INSERT INTO agent_execution_chain (agent_id, last_execution_hash, last_execution_index, updated_at)
    VALUES (p_agent_id, p_execution_hash, p_execution_index, NOW())
    ON CONFLICT (agent_id) DO UPDATE SET
      last_execution_hash = EXCLUDED.last_execution_hash,
      last_execution_index = EXCLUDED.last_execution_index,
      updated_at = NOW();
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'execution_id', v_execution.id,
    'job_id', p_job_id,
    'status', p_status,
    'execution_cleared', true,
    'hash_chain_updated', (p_execution_hash IS NOT NULL)
  );
END;
$$;