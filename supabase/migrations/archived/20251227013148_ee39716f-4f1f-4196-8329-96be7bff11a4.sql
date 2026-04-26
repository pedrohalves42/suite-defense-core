
-- Drop and recreate finalize_job_execution with correct parameters
CREATE OR REPLACE FUNCTION public.finalize_job_execution(
  p_execution_id uuid,
  p_agent_id uuid,
  p_job_id uuid,
  p_status text,
  p_started_at timestamp with time zone DEFAULT NULL,
  p_finished_at timestamp with time zone DEFAULT NULL,
  p_output_hash text DEFAULT NULL,
  p_error_message text DEFAULT NULL,
  p_execution_time_seconds numeric DEFAULT NULL,
  p_result_signature text DEFAULT NULL,
  p_signature_verified boolean DEFAULT false,
  p_execution_hash text DEFAULT NULL,
  p_previous_execution_hash text DEFAULT NULL,
  p_execution_index bigint DEFAULT NULL
)
RETURNS jsonb
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
    started_at = COALESCE(p_started_at, started_at),
    finished_at = COALESCE(p_finished_at, NOW()),
    output_hash = COALESCE(p_output_hash, output_hash),
    error_message = p_error_message,
    execution_time_seconds = p_execution_time_seconds,
    result_signature = p_result_signature,
    signature_verified = p_signature_verified,
    execution_hash = p_execution_hash,
    previous_execution_hash = p_previous_execution_hash,
    execution_index = p_execution_index
  WHERE id = p_execution_id;

  -- Update job status and clear execution link
  UPDATE jobs
  SET
    status = p_status,
    completed_at = COALESCE(p_finished_at, NOW()),
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
    'execution_time_seconds', p_execution_time_seconds,
    'hash_chain_recorded', (p_execution_hash IS NOT NULL)
  );
END;
$$;

-- Add execution_time_seconds column to job_executions if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'job_executions' 
    AND column_name = 'execution_time_seconds'
  ) THEN
    ALTER TABLE public.job_executions ADD COLUMN execution_time_seconds numeric;
    COMMENT ON COLUMN public.job_executions.execution_time_seconds IS 'Execution duration in seconds as reported by agent';
  END IF;
END $$;
