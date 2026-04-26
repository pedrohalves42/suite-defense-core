-- P0-002: Adicionar UNIQUE constraint nas particoes de hmac_signatures
-- Para tabelas particionadas, o constraint deve incluir a coluna de particionamento (used_at)
-- Criar indice unico global na tabela particionada base
CREATE UNIQUE INDEX IF NOT EXISTS hmac_signatures_signature_used_at_unique 
ON hmac_signatures_partitioned (signature, used_at);

-- Adicionar constraint nas particoes existentes
CREATE UNIQUE INDEX IF NOT EXISTS hmac_signatures_2025_12_signature_unique 
ON hmac_signatures_2025_12 (signature);

CREATE UNIQUE INDEX IF NOT EXISTS hmac_signatures_2026_01_signature_unique 
ON hmac_signatures_2026_01 (signature);

-- P0-003: Criar RPC claim_jobs_for_agent com locking atomico
-- Esta funcao usa SELECT FOR UPDATE SKIP LOCKED para garantir que apenas um agente
-- pode reclamar cada job, prevenindo execucoes paralelas
CREATE OR REPLACE FUNCTION claim_jobs_for_agent(
  p_agent_id UUID,
  p_agent_name TEXT,
  p_limit INT DEFAULT 3
)
RETURNS TABLE (
  id UUID,
  type TEXT,
  payload JSONB,
  approved BOOLEAN,
  agent_id UUID,
  agent_name TEXT,
  priority INT,
  created_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job_ids UUID[];
  v_now TIMESTAMPTZ := NOW();
BEGIN
  -- Selecionar e travar jobs atomicamente usando FOR UPDATE SKIP LOCKED
  -- Isso garante que se outro agente/processo ja travou o job, ele e pulado
  SELECT array_agg(j.id) INTO v_job_ids
  FROM (
    SELECT jobs.id 
    FROM jobs
    WHERE (jobs.agent_id = p_agent_id OR jobs.agent_name = p_agent_name)
      AND jobs.status = 'queued'
      AND jobs.expires_at > v_now
    ORDER BY jobs.priority ASC, jobs.created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  ) j;
  
  -- Se encontrou jobs, marcar como delivered atomicamente
  IF v_job_ids IS NOT NULL AND array_length(v_job_ids, 1) > 0 THEN
    UPDATE jobs
    SET 
      status = 'delivered', 
      delivered_at = v_now,
      delivery_attempts = COALESCE(delivery_attempts, 0) + 1
    WHERE jobs.id = ANY(v_job_ids);
    
    -- Retornar jobs reclamados
    RETURN QUERY 
    SELECT 
      jobs.id,
      jobs.type,
      jobs.payload,
      jobs.approved,
      jobs.agent_id,
      jobs.agent_name,
      jobs.priority,
      jobs.created_at,
      jobs.expires_at
    FROM jobs 
    WHERE jobs.id = ANY(v_job_ids);
  END IF;
  
  -- Retorna vazio se nenhum job foi encontrado
  RETURN;
END;
$$;

-- Comentario explicando a funcao
COMMENT ON FUNCTION claim_jobs_for_agent IS 'Atomic job claiming with SELECT FOR UPDATE SKIP LOCKED to prevent parallel execution';