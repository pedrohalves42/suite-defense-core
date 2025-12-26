-- ============================================================================
-- Fix function overloading: DROP ALL versions and recreate single canonical version
-- ============================================================================

-- DROP the 14-argument version first (required by PostgreSQL hint)
DROP FUNCTION IF EXISTS public.finalize_job_execution(
  uuid, uuid, uuid, text, 
  timestamp with time zone, timestamp with time zone, 
  text, text, integer, text, boolean,
  text, text, bigint
);

-- DROP the 11-argument version
DROP FUNCTION IF EXISTS public.finalize_job_execution(
  uuid, uuid, uuid, text, 
  timestamp with time zone, timestamp with time zone, 
  text, text, integer, text, boolean
);

-- Create the SINGLE canonical version with hash chain support
CREATE OR REPLACE FUNCTION public.finalize_job_execution(
  p_execution_id UUID,
  p_agent_id UUID,
  p_job_id UUID,
  p_status TEXT,
  p_claimed_at TIMESTAMPTZ,
  p_started_at TIMESTAMPTZ,
  p_output_hash TEXT DEFAULT NULL,
  p_error_message TEXT DEFAULT NULL,
  p_exit_code INTEGER DEFAULT NULL,
  p_result_signature TEXT DEFAULT NULL,
  p_signature_verified BOOLEAN DEFAULT false,
  -- Hash chain fields
  p_execution_hash TEXT DEFAULT NULL,
  p_previous_execution_hash TEXT DEFAULT NULL,
  p_execution_index BIGINT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_execution job_executions%ROWTYPE;
BEGIN
  -- Lock execution row
  SELECT * INTO v_execution
  FROM job_executions
  WHERE id = p_execution_id
    AND agent_id = p_agent_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'EXECUTION_NOT_FOUND: Execution % not found for agent %', p_execution_id, p_agent_id;
  END IF;

  -- Prevent re-finalization (idempotent)
  IF v_execution.status IN ('completed', 'failed', 'cancelled', 'done') THEN
    RETURN jsonb_build_object(
      'success', true,
      'idempotent', true,
      'message', 'Execution already finalized'
    );
  END IF;

  -- Update execution with all fields including hash chain
  UPDATE job_executions
  SET
    status = p_status,
    output_hash = COALESCE(p_output_hash, output_hash),
    error_message = p_error_message,
    exit_code = p_exit_code,
    result_signature = p_result_signature,
    signature_verified = p_signature_verified,
    finished_at = NOW(),
    -- Hash chain fields
    execution_hash = p_execution_hash,
    previous_execution_hash = p_previous_execution_hash,
    execution_index = p_execution_index
  WHERE id = p_execution_id;

  -- Update job status and clear execution link
  UPDATE jobs
  SET
    status = p_status,
    completed_at = NOW(),
    error_message = p_error_message,
    current_execution_id = NULL
  WHERE id = p_job_id;

  -- Update agent execution chain tracker if hash chain data provided
  IF p_execution_hash IS NOT NULL AND p_execution_index IS NOT NULL THEN
    INSERT INTO agent_execution_chain (
      agent_id,
      last_execution_hash,
      last_execution_index,
      updated_at
    )
    VALUES (
      p_agent_id,
      p_execution_hash,
      p_execution_index,
      NOW()
    )
    ON CONFLICT (agent_id)
    DO UPDATE SET
      last_execution_hash = EXCLUDED.last_execution_hash,
      last_execution_index = EXCLUDED.last_execution_index,
      updated_at = NOW();
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'execution_id', p_execution_id,
    'status', p_status,
    'hash_chain_recorded', (p_execution_hash IS NOT NULL)
  );
END;
$$;