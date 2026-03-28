
-- =============================================================================
-- SECURITY PATCH: V-101 and V-102 - Cross-Tenant Validation
-- Audit: Dr. Isaac K. Vellum - Security Hardening
-- =============================================================================

-- =============================================================================
-- V-101 FIX: cleanup_problematic_agent - Add tenant validation
-- =============================================================================
CREATE OR REPLACE FUNCTION cleanup_problematic_agent(p_agent_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agent_name TEXT;
  v_tenant_id UUID;
  v_caller_tenant_id UUID;
  v_tokens_invalidated INT;
  v_jobs_deleted INT;
BEGIN
  -- ? SECURITY: Get caller's tenant context
  v_caller_tenant_id := get_active_tenant_id();
  
  -- Allow super_admin to bypass tenant check
  IF v_caller_tenant_id IS NULL AND NOT is_current_super_admin() THEN
    INSERT INTO security_logs (
      event_type, severity, message, details, tenant_id, user_id
    ) VALUES (
      'TENANT_VALIDATION_FAILED',
      'high',
      'cleanup_problematic_agent called without valid tenant context',
      jsonb_build_object('agent_id', p_agent_id),
      NULL,
      auth.uid()
    );
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INVALID_TENANT_CONTEXT'
    );
  END IF;

  -- Get agent info
  SELECT agent_name, tenant_id INTO v_agent_name, v_tenant_id
  FROM agents
  WHERE id = p_agent_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Agent not found',
      'agent_id', p_agent_id
    );
  END IF;
  
  -- ? CRITICAL: Validate caller owns this agent (unless super_admin)
  IF NOT is_current_super_admin() AND v_caller_tenant_id != v_tenant_id THEN
    -- LOG ATTACK: Cross-tenant access attempt
    INSERT INTO security_logs (
      event_type, severity, message, details, tenant_id, user_id
    ) VALUES (
      'CROSS_TENANT_ACCESS_ATTEMPT',
      'critical',
      'Attempted cross-tenant agent cleanup',
      jsonb_build_object(
        'target_agent_id', p_agent_id,
        'target_tenant_id', v_tenant_id,
        'caller_tenant_id', v_caller_tenant_id,
        'agent_name', v_agent_name
      ),
      v_caller_tenant_id,
      auth.uid()
    );

    RETURN jsonb_build_object(
      'success', false,
      'error', 'TENANT_MISMATCH'
    );
  END IF;
  
  -- Invalidate old tokens
  UPDATE agent_tokens 
  SET is_active = false 
  WHERE agent_id = p_agent_id;
  
  GET DIAGNOSTICS v_tokens_invalidated = ROW_COUNT;
  
  -- Remove pending jobs
  DELETE FROM jobs 
  WHERE agent_id = p_agent_id 
    AND status IN ('queued', 'delivered');
  
  GET DIAGNOSTICS v_jobs_deleted = ROW_COUNT;
  
  -- Reset agent status
  UPDATE agents 
  SET 
    status = 'pending',
    last_heartbeat = NULL
  WHERE id = p_agent_id;
  
  -- Audit log
  INSERT INTO audit_logs (
    tenant_id,
    user_id,
    action,
    resource_type,
    resource_id,
    success,
    details
  ) VALUES (
    v_tenant_id,
    auth.uid(),
    'cleanup_agent',
    'agent',
    p_agent_id::text,
    true,
    jsonb_build_object(
      'agent_name', v_agent_name,
      'tokens_invalidated', v_tokens_invalidated,
      'jobs_deleted', v_jobs_deleted
    )
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'agent_id', p_agent_id,
    'agent_name', v_agent_name,
    'tokens_invalidated', v_tokens_invalidated,
    'jobs_deleted', v_jobs_deleted
  );
END;
$$;

-- =============================================================================
-- V-102 FIX: claim_jobs_for_agent - Add agent ownership validation
-- =============================================================================
CREATE OR REPLACE FUNCTION claim_jobs_for_agent(
  p_agent_id uuid,
  p_limit integer DEFAULT 5,
  OUT job_id uuid,
  OUT job_type text,
  OUT payload jsonb,
  OUT payload_hash text,
  OUT expires_at timestamptz,
  OUT execution_id uuid,
  OUT nonce uuid,
  OUT execution_index bigint,
  OUT previous_execution_hash text
)
RETURNS SETOF record
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
BEGIN
  -- Get agent info including version
  SELECT a.tenant_id, a.agent_name, a.agent_version 
  INTO v_tenant_id, v_agent_name, v_agent_version
  FROM agents a 
  WHERE a.id = p_agent_id;

  IF v_tenant_id IS NULL THEN
    RETURN;
  END IF;

  -- ? SECURITY: Validate caller context (skip for service_role/agent calls)
  -- Note: Agent calls come through Edge Functions with service_role
  -- User-initiated calls must validate tenant ownership
  v_caller_tenant_id := get_active_tenant_id();
  
  IF v_caller_tenant_id IS NOT NULL AND v_caller_tenant_id != v_tenant_id THEN
    -- LOG ATTACK: Cross-tenant job claim attempt
    INSERT INTO security_logs (
      event_type, severity, message, details, tenant_id, user_id
    ) VALUES (
      'CROSS_TENANT_JOB_CLAIM_ATTEMPT',
      'high',
      'Attempted to claim jobs for agent in different tenant',
      jsonb_build_object(
        'target_agent_id', p_agent_id,
        'target_tenant_id', v_tenant_id,
        'caller_tenant_id', v_caller_tenant_id,
        'agent_name', v_agent_name
      ),
      v_caller_tenant_id,
      auth.uid()
    );
    
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
    
    -- CRITICAL: CREATE EXECUTION RECORD
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

-- =============================================================================
-- V-103 FIX: Document service_role policies
-- =============================================================================
COMMENT ON FUNCTION cleanup_problematic_agent(uuid) IS 
'SECURITY HARDENED (V-101): Validates caller tenant ownership before cleanup.
Logs cross-tenant access attempts to security_logs with severity=critical.
Super admins can bypass tenant check.';

COMMENT ON FUNCTION claim_jobs_for_agent(uuid, integer) IS 
'SECURITY HARDENED (V-102): Validates caller tenant matches agent tenant.
Logs cross-tenant job claim attempts to security_logs with severity=high.
Service role calls (from Edge Functions) bypass user validation.';
