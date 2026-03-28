
-- =====================================================
-- FASE 1: Sincronizar agent_execution_chain com estado real
-- =====================================================

-- Corrigir dessincronizacao do chain para todos os agentes
UPDATE agent_execution_chain aec
SET 
  last_execution_index = COALESCE(
    (SELECT MAX(execution_index) 
     FROM job_executions 
     WHERE agent_id = aec.agent_id AND execution_index IS NOT NULL),
    aec.last_execution_index
  ),
  last_execution_hash = COALESCE(
    (SELECT execution_hash 
     FROM job_executions 
     WHERE agent_id = aec.agent_id AND execution_index IS NOT NULL
     ORDER BY execution_index DESC LIMIT 1),
    aec.last_execution_hash
  ),
  updated_at = NOW()
WHERE EXISTS (
  SELECT 1 FROM job_executions je 
  WHERE je.agent_id = aec.agent_id 
  AND je.execution_index > aec.last_execution_index
);

-- =====================================================
-- FASE 2: Recriar RPC claim_jobs_for_agent com protecao
-- =====================================================

CREATE OR REPLACE FUNCTION public.claim_jobs_for_agent(p_agent_id uuid, p_max_jobs integer DEFAULT 5)
 RETURNS TABLE(job_id uuid, job_type text, payload jsonb, payload_hash text, expires_at timestamp with time zone, execution_id uuid, nonce uuid, execution_index bigint, previous_execution_hash text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_tenant_id UUID;
  v_agent_version TEXT;
  v_agent_name TEXT;
  v_job RECORD;
  v_execution_id UUID;
  v_nonce UUID;
  v_chain RECORD;
  v_new_index BIGINT;
  v_new_hash TEXT;
  v_claimed_count INTEGER := 0;
  v_max_existing_index BIGINT;
BEGIN
  -- Get agent's tenant_id, version, and name
  SELECT a.tenant_id, a.agent_version, a.agent_name 
  INTO v_tenant_id, v_agent_version, v_agent_name
  FROM public.agents a
  WHERE a.id = p_agent_id;
  
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Agent not found: %', p_agent_id;
  END IF;
  
  -- Get or initialize execution chain
  SELECT * INTO v_chain
  FROM public.agent_execution_chain
  WHERE agent_id = p_agent_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    INSERT INTO public.agent_execution_chain (agent_id, last_execution_index, last_execution_hash)
    VALUES (p_agent_id, 0, encode(sha256('genesis'::bytea), 'hex'))
    RETURNING * INTO v_chain;
  END IF;
  
  -- CRITICAL FIX: Get the actual max execution_index from job_executions
  -- This prevents constraint violations when chain is out of sync
  SELECT COALESCE(MAX(je.execution_index), 0) INTO v_max_existing_index
  FROM public.job_executions je
  WHERE je.agent_id = p_agent_id;
  
  -- If chain is behind the actual max, sync it first
  IF v_chain.last_execution_index < v_max_existing_index THEN
    SELECT je.execution_hash INTO v_chain.last_execution_hash
    FROM public.job_executions je
    WHERE je.agent_id = p_agent_id AND je.execution_index = v_max_existing_index;
    
    v_chain.last_execution_index := v_max_existing_index;
    
    -- Persist the sync immediately
    UPDATE public.agent_execution_chain
    SET 
      last_execution_index = v_max_existing_index,
      last_execution_hash = v_chain.last_execution_hash,
      updated_at = NOW()
    WHERE agent_id = p_agent_id;
    
    RAISE NOTICE 'Synchronized chain for agent %: index updated to %', p_agent_id, v_max_existing_index;
  END IF;
  
  -- Claim jobs atomically using FOR UPDATE SKIP LOCKED
  FOR v_job IN
    SELECT j.*
    FROM public.jobs j
    WHERE j.agent_id = p_agent_id
      AND j.tenant_id = v_tenant_id
      AND j.status = 'queued'
      AND j.approved = true
      AND j.current_execution_id IS NULL
      AND (j.next_run_at IS NULL OR j.next_run_at <= NOW())
      AND (j.expires_at IS NULL OR j.expires_at > NOW())
    ORDER BY j.priority DESC NULLS LAST, j.created_at ASC
    LIMIT p_max_jobs
    FOR UPDATE OF j SKIP LOCKED
  LOOP
    -- Generate UUID nonce for this execution
    v_nonce := gen_random_uuid();
    
    -- Calculate new chain values using synced index
    v_new_index := v_chain.last_execution_index + 1;
    v_new_hash := encode(sha256(
      convert_to(
        v_chain.last_execution_hash || 
        v_job.id::text || 
        v_nonce::text || 
        v_new_index::text,
        'UTF8'
      )
    ), 'hex');
    
    -- Create execution record with agent_version and agent_name
    BEGIN
      INSERT INTO public.job_executions (
        job_id,
        agent_id,
        tenant_id,
        agent_version,
        agent_name,
        nonce,
        execution_index,
        previous_execution_hash,
        execution_hash,
        payload_hash,
        claimed_at,
        started_at
      ) VALUES (
        v_job.id,
        p_agent_id,
        v_tenant_id,
        COALESCE(v_agent_version, 'unknown'),
        v_agent_name,
        v_nonce,
        v_new_index,
        v_chain.last_execution_hash,
        v_new_hash,
        v_job.payload_hash,
        NOW(),
        NOW()
      )
      RETURNING id INTO v_execution_id;
    EXCEPTION WHEN unique_violation THEN
      -- If we still hit a constraint violation, skip this job and continue
      RAISE WARNING 'Constraint violation for agent % job %, skipping', p_agent_id, v_job.id;
      CONTINUE;
    END;
    
    -- Update job status and link execution
    UPDATE public.jobs
    SET 
      status = 'delivered',
      delivered_at = NOW(),
      current_execution_id = v_execution_id
    WHERE id = v_job.id;
    
    -- Update chain state
    v_chain.last_execution_index := v_new_index;
    v_chain.last_execution_hash := v_new_hash;
    
    v_claimed_count := v_claimed_count + 1;
    
    -- Return this job
    job_id := v_job.id;
    job_type := v_job.type;
    payload := v_job.payload;
    payload_hash := v_job.payload_hash;
    expires_at := v_job.expires_at;
    execution_id := v_execution_id;
    nonce := v_nonce;
    execution_index := v_new_index;
    previous_execution_hash := v_chain.last_execution_hash;
    RETURN NEXT;
  END LOOP;
  
  -- Persist chain updates if we claimed any jobs
  IF v_claimed_count > 0 THEN
    UPDATE public.agent_execution_chain
    SET 
      last_execution_index = v_chain.last_execution_index,
      last_execution_hash = v_chain.last_execution_hash,
      updated_at = NOW()
    WHERE agent_id = p_agent_id;
  END IF;
  
  RETURN;
END;
$function$;

-- =====================================================
-- FASE 3: View de monitoramento de saude do chain
-- =====================================================

CREATE OR REPLACE VIEW v_execution_chain_health AS
SELECT 
  aec.agent_id,
  a.agent_name,
  a.status as agent_status,
  aec.last_execution_index as chain_index,
  COALESCE(MAX(je.execution_index), 0) as actual_max_index,
  CASE 
    WHEN COALESCE(MAX(je.execution_index), 0) > aec.last_execution_index THEN 'DESSINCRONIZADO'
    WHEN COALESCE(MAX(je.execution_index), 0) < aec.last_execution_index THEN 'CHAIN_AHEAD'
    ELSE 'OK'
  END as sync_status,
  aec.updated_at as chain_updated_at
FROM agent_execution_chain aec
JOIN agents a ON a.id = aec.agent_id
LEFT JOIN job_executions je ON je.agent_id = aec.agent_id
GROUP BY aec.agent_id, a.agent_name, a.status, aec.last_execution_index, aec.updated_at;

-- Grant access to the view
GRANT SELECT ON v_execution_chain_health TO authenticated;
