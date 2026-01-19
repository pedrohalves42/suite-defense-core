
-- Drop legacy overload to avoid ambiguity
DROP FUNCTION IF EXISTS public.claim_jobs_for_agent(uuid, text, uuid, integer);

-- Now recreate the correct function with explicit signature
DROP FUNCTION IF EXISTS public.claim_jobs_for_agent(uuid, integer);

CREATE FUNCTION public.claim_jobs_for_agent(
  p_agent_id uuid,
  p_limit integer DEFAULT 3
)
RETURNS TABLE(
  job_id uuid,
  job_type text,
  payload jsonb,
  payload_hash text,
  expires_at timestamptz,
  execution_id uuid,
  nonce uuid,
  execution_index bigint,
  previous_execution_hash text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant_id uuid;
  v_agent_name text;
  v_agent_version text;
  v_job RECORD;
  v_execution_id uuid;
  v_nonce uuid;
  v_new_index bigint;
  v_new_hash text;
  v_chain RECORD;
BEGIN
  -- Get agent info including version
  SELECT a.tenant_id, a.agent_name, a.agent_version 
  INTO v_tenant_id, v_agent_name, v_agent_version
  FROM agents a 
  WHERE a.id = p_agent_id;

  IF v_tenant_id IS NULL THEN
    RETURN;
  END IF;

  -- Process each claimed job
  FOR v_job IN
    WITH claimed AS (
      UPDATE jobs
      SET 
        status = 'delivered',
        agent_id = p_agent_id,
        agent_name = v_agent_name,
        delivered_at = now(),
        delivery_attempts = delivery_attempts + 1
      WHERE jobs.id IN (
        SELECT j.id
        FROM jobs j
        WHERE j.status IN ('queued', 'pending')
          AND j.tenant_id = v_tenant_id
          AND j.approved = true
          AND (j.scheduled_at IS NULL OR j.scheduled_at <= now())
          AND (j.expires_at IS NULL OR j.expires_at > now())
        ORDER BY j.priority DESC NULLS LAST, j.created_at ASC
        LIMIT p_limit
        FOR UPDATE SKIP LOCKED
      )
      RETURNING jobs.*
    )
    SELECT * FROM claimed
  LOOP
    -- Generate unique nonce for this execution
    v_nonce := gen_random_uuid();
    
    -- Get current hash chain state for this agent
    SELECT last_execution_hash, last_execution_index
    INTO v_chain
    FROM agent_execution_chain
    WHERE agent_id = p_agent_id;
    
    -- Calculate new execution index
    v_new_index := COALESCE(v_chain.last_execution_index, 0) + 1;
    
    -- Calculate new execution hash (chain link)
    v_new_hash := encode(sha256(
      (COALESCE(v_chain.last_execution_hash, 'genesis') || 
       v_job.id::text || 
       v_nonce::text || 
       v_new_index::text)::bytea
    ), 'hex');
    
    -- CRITICAL: CREATE EXECUTION RECORD (was missing!)
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
      started_at,
      status
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
      NOW(),
      'running'
    )
    RETURNING id INTO v_execution_id;
    
    -- Link job to execution
    UPDATE jobs 
    SET current_execution_id = v_execution_id 
    WHERE id = v_job.id;
    
    -- Update agent execution chain
    INSERT INTO agent_execution_chain (agent_id, last_execution_hash, last_execution_index, updated_at)
    VALUES (p_agent_id, v_new_hash, v_new_index, NOW())
    ON CONFLICT (agent_id) DO UPDATE SET
      last_execution_hash = EXCLUDED.last_execution_hash,
      last_execution_index = EXCLUDED.last_execution_index,
      updated_at = EXCLUDED.updated_at;
    
    -- Return job data with execution info
    job_id := v_job.id;
    job_type := v_job.type;
    payload := v_job.payload;
    payload_hash := v_job.payload_hash;
    expires_at := COALESCE(v_job.expires_at, now() + interval '1 hour');
    execution_id := v_execution_id;
    nonce := v_nonce;
    execution_index := v_new_index;
    previous_execution_hash := v_chain.last_execution_hash;
    RETURN NEXT;
  END LOOP;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.claim_jobs_for_agent(uuid, integer) TO service_role;

-- Add comment documenting the fix
COMMENT ON FUNCTION public.claim_jobs_for_agent(uuid, integer) IS 'Claims jobs for agent and creates immutable job_executions audit trail. Fixed 2026-01-19 to properly INSERT into job_executions table.';
