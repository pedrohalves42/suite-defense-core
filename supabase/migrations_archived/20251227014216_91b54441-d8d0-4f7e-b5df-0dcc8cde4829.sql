
-- Drop the OLD version of finalize_job_execution that has incorrect parameters
-- Keep only the new version with p_finished_at and p_execution_time_seconds

DROP FUNCTION IF EXISTS public.finalize_job_execution(
  p_execution_id uuid,
  p_agent_id uuid,
  p_job_id uuid,
  p_status text,
  p_claimed_at timestamp with time zone,
  p_started_at timestamp with time zone,
  p_output_hash text,
  p_error_message text,
  p_exit_code integer,
  p_result_signature text,
  p_signature_verified boolean,
  p_execution_hash text,
  p_previous_execution_hash text,
  p_execution_index bigint
);
