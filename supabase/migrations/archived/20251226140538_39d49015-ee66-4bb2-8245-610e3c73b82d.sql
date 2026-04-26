-- =====================================================
-- FIX: claim_jobs_for_agent - correct column name
-- previous_hash -> previous_execution_hash
-- nonce as UUID instead of text hex
-- =====================================================

DROP FUNCTION IF EXISTS public.claim_jobs_for_agent(uuid, integer);

CREATE OR REPLACE FUNCTION public.claim_jobs_for_agent(
  p_agent_id UUID,
  p_max_jobs INTEGER DEFAULT 5
)
RETURNS TABLE (
  job_id UUID,
  job_type TEXT,
  payload JSONB,
  payload_hash TEXT,
  expires_at TIMESTAMPTZ,
  execution_id UUID,
  nonce UUID,
  execution_index BIGINT,
  previous_execution_hash TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_tenant_id UUID;
  v_job RECORD;
  v_execution_id UUID;
  v_nonce UUID;
  v_chain RECORD;
  v_new_index BIGINT;
  v_new_hash TEXT;
  v_claimed_count INTEGER := 0;
BEGIN
  -- Get agent's tenant_id
  SELECT a.tenant_id INTO v_tenant_id
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
    
    -- Calculate new chain values
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
    
    -- Create execution record with CORRECT column name
    INSERT INTO public.job_executions (
      job_id,
      agent_id,
      tenant_id,
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
      v_nonce,
      v_new_index,
      v_chain.last_execution_hash,
      v_new_hash,
      v_job.payload_hash,
      NOW(),
      NOW()
    )
    RETURNING id INTO v_execution_id;
    
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
$$;