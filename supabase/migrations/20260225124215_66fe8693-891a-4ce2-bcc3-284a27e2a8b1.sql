-- Temporarily disable immutability trigger for backfill
ALTER TABLE public.job_executions DISABLE TRIGGER enforce_execution_immutability;

-- Backfill completed_at from finished_at
UPDATE public.job_executions SET completed_at = finished_at WHERE completed_at IS NULL AND finished_at IS NOT NULL;

-- Re-enable
ALTER TABLE public.job_executions ENABLE TRIGGER enforce_execution_immutability;

-- Fix finalize_job_execution to use both columns
CREATE OR REPLACE FUNCTION public.finalize_job_execution(
  p_execution_id uuid,
  p_agent_id uuid,
  p_status text,
  p_exit_code integer DEFAULT NULL,
  p_output jsonb DEFAULT NULL,
  p_error_message text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_execution job_executions%ROWTYPE;
  v_caller_tenant uuid; v_agent_tenant uuid;
BEGIN
  v_caller_tenant := get_active_tenant_id();
  SELECT tenant_id INTO v_agent_tenant FROM agents WHERE id = p_agent_id;
  IF v_caller_tenant IS NOT NULL AND v_agent_tenant IS NOT NULL AND v_agent_tenant != v_caller_tenant AND NOT is_current_super_admin() THEN
    INSERT INTO security_logs (tenant_id, event_type, severity, details)
    VALUES (v_caller_tenant, 'cross_tenant_blocked', 'critical',
      jsonb_build_object('function', 'finalize_job_execution', 'target_agent', p_agent_id));
    RETURN jsonb_build_object('success', false, 'error', 'TENANT_MISMATCH');
  END IF;
  SELECT * INTO v_execution FROM job_executions WHERE id = p_execution_id AND agent_id = p_agent_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'EXECUTION_NOT_FOUND'; END IF;
  IF v_execution.status IN ('completed', 'failed', 'cancelled', 'done') THEN
    RETURN jsonb_build_object('success', true, 'message', 'Already finalized', 'status', v_execution.status);
  END IF;
  UPDATE job_executions SET status = p_status, exit_code = p_exit_code,
    finished_at = now(), completed_at = now() WHERE id = p_execution_id;
  UPDATE jobs SET status = CASE WHEN p_status = 'completed' THEN 'completed' ELSE 'failed' END,
    completed_at = now() WHERE id = v_execution.job_id AND status NOT IN ('completed', 'failed', 'cancelled');
  RETURN jsonb_build_object('success', true, 'status', p_status);
END;
$$;