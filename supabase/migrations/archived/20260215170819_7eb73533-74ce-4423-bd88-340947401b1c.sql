
-- FIX: Make claim_jobs_for_agent resilient to uniq_execution_chain violations
-- The issue: execution_index can be duplicated if previous executions left orphan records
-- with indices that conflict with the chain's calculated next index.
-- Solution: Use a sub-transaction (EXCEPTION block) per job to skip conflicting executions.
CREATE OR REPLACE FUNCTION public.claim_jobs_for_agent(
  p_agent_id uuid,
  p_limit integer DEFAULT 5
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
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_caller_tenant_id uuid;
  v_agent_name text;
  v_agent_version text;
  v_job RECORD;
  v_execution_id uuid;
  v_nonce uuid;
  v_new_index bigint;
  v_new_hash text;
  v_chain RECORD;
  v_actual_max_index bigint;
  v_recovered_hash text;
BEGIN
  SELECT a.tenant_id, a.agent_name, a.agent_version 
  INTO v_tenant_id, v_agent_name, v_agent_version
  FROM agents a WHERE a.id = p_agent_id;

  IF v_tenant_id IS NULL THEN RETURN; END IF;

  v_caller_tenant_id := get_active_tenant_id();
  IF v_caller_tenant_id IS NOT NULL AND v_caller_tenant_id != v_tenant_id THEN
    INSERT INTO security_logs (attack_type, severity, ip_address, endpoint, blocked, details, tenant_id, user_id)
    VALUES ('CROSS_TENANT_JOB_CLAIM_ATTEMPT', 'high',
      COALESCE(current_setting('request.headers', true)::json->>'x-forwarded-for', 'unknown'),
      'rpc/claim_jobs_for_agent', true,
      jsonb_build_object('target_agent_id', p_agent_id, 'target_tenant_id', v_tenant_id, 'caller_tenant_id', v_caller_tenant_id, 'agent_name', v_agent_name),
      v_caller_tenant_id, auth.uid());
    RETURN;
  END IF;

  -- Ensure chain row exists
  INSERT INTO agent_execution_chain (agent_id, last_execution_hash, last_execution_index, updated_at)
  VALUES (p_agent_id, encode(sha256(('genesis_' || p_agent_id::text)::bytea), 'hex'), 0, NOW())
  ON CONFLICT (agent_id) DO NOTHING;

  -- Lock chain row
  SELECT last_execution_hash, last_execution_index
  INTO v_chain
  FROM agent_execution_chain
  WHERE agent_id = p_agent_id
  FOR UPDATE;

  -- SELF-HEALING: Always sync chain with actual max execution_index
  -- This ensures we never generate a conflicting index
  SELECT MAX(je.execution_index) INTO v_actual_max_index
  FROM job_executions je
  WHERE je.agent_id = p_agent_id AND je.execution_index IS NOT NULL;

  -- FIX: Sync if actual is HIGHER OR EQUAL to chain (not just higher)
  -- This catches cases where chain index matches but the next index would conflict
  IF v_actual_max_index IS NOT NULL AND v_actual_max_index >= COALESCE(v_chain.last_execution_index, 0) THEN
    SELECT COALESCE(je.execution_hash, encode(sha256(('recovery_' || je.id::text)::bytea), 'hex'))
    INTO v_recovered_hash
    FROM job_executions je
    WHERE je.agent_id = p_agent_id AND je.execution_index = v_actual_max_index
    LIMIT 1;
    
    v_chain.last_execution_hash := COALESCE(v_recovered_hash, encode(sha256(('genesis_' || p_agent_id::text)::bytea), 'hex'));
    v_chain.last_execution_index := v_actual_max_index;

    UPDATE agent_execution_chain SET
      last_execution_hash = v_chain.last_execution_hash,
      last_execution_index = v_chain.last_execution_index,
      updated_at = NOW()
    WHERE agent_id = p_agent_id;
  END IF;

  FOR v_job IN
    WITH claimed AS (
      UPDATE jobs
      SET status = 'delivered', agent_id = p_agent_id, agent_name = v_agent_name,
          delivered_at = now(), delivery_attempts = delivery_attempts + 1
      WHERE jobs.id IN (
        SELECT j.id FROM jobs j
        WHERE j.status IN ('queued', 'pending')
          AND j.tenant_id = v_tenant_id AND j.approved = true
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
    BEGIN
      v_nonce := gen_random_uuid();
      v_new_index := COALESCE(v_chain.last_execution_index, 0) + 1;
      
      v_new_hash := encode(sha256(
        (COALESCE(v_chain.last_execution_hash, 'genesis') || 
         v_job.id::text || v_nonce::text || v_new_index::text)::bytea
      ), 'hex');
      
      INSERT INTO public.job_executions (
        job_id, agent_id, tenant_id, agent_version, agent_name,
        nonce, execution_index, previous_execution_hash, execution_hash,
        payload_hash, claimed_at, started_at, status
      ) VALUES (
        v_job.id, p_agent_id, v_tenant_id, COALESCE(v_agent_version, 'unknown'),
        v_agent_name, v_nonce, v_new_index, v_chain.last_execution_hash,
        v_new_hash, v_job.payload_hash, NOW(), NOW(), 'running'
      )
      RETURNING id INTO v_execution_id;
      
      UPDATE jobs SET current_execution_id = v_execution_id WHERE id = v_job.id;
      
      v_chain.last_execution_hash := v_new_hash;
      v_chain.last_execution_index := v_new_index;
      
      UPDATE agent_execution_chain SET
        last_execution_hash = v_new_hash,
        last_execution_index = v_new_index,
        updated_at = NOW()
      WHERE agent_id = p_agent_id;
      
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
    EXCEPTION WHEN unique_violation THEN
      -- uniq_execution_chain conflict: resync chain and skip this job
      -- The job stays 'delivered' and will be retried on next poll
      SELECT MAX(je2.execution_index) INTO v_actual_max_index
      FROM job_executions je2
      WHERE je2.agent_id = p_agent_id AND je2.execution_index IS NOT NULL;
      
      IF v_actual_max_index IS NOT NULL THEN
        SELECT COALESCE(je2.execution_hash, encode(sha256(('recovery_' || je2.id::text)::bytea), 'hex'))
        INTO v_recovered_hash
        FROM job_executions je2
        WHERE je2.agent_id = p_agent_id AND je2.execution_index = v_actual_max_index
        LIMIT 1;
        
        v_chain.last_execution_hash := COALESCE(v_recovered_hash, encode(sha256(('genesis_' || p_agent_id::text)::bytea), 'hex'));
        v_chain.last_execution_index := v_actual_max_index;
        
        UPDATE agent_execution_chain SET
          last_execution_hash = v_chain.last_execution_hash,
          last_execution_index = v_chain.last_execution_index,
          updated_at = NOW()
        WHERE agent_id = p_agent_id;
      END IF;
      
      -- Revert job to queued so it can be claimed again
      UPDATE jobs SET status = 'queued', delivered_at = NULL, 
        delivery_attempts = delivery_attempts - 1
      WHERE id = v_job.id;
      
      CONTINUE; -- Skip to next job
    END;
  END LOOP;
END;
$$;
