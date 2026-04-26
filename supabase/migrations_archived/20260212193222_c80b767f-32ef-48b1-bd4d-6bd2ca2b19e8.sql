
-- Fix DLQ table name: it's failed_jobs_dlq, not dead_letter_queue
CREATE OR REPLACE FUNCTION public.auto_cancel_archived_agent_jobs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cancelled_count integer := 0;
BEGIN
  WITH cancelled AS (
    UPDATE jobs j
    SET 
      status = 'cancelled',
      finished_at = now(),
      error_message = 'Auto-cancelled: agent archived'
    FROM agents a
    WHERE j.agent_id = a.id
      AND a.archived_at IS NOT NULL
      AND j.status IN ('pending', 'queued', 'delivered')
    RETURNING j.id, j.tenant_id, j.agent_id, j.agent_name, j.type, j.payload
  )
  SELECT count(*) INTO v_cancelled_count FROM cancelled;

  -- Add to DLQ for tracking
  INSERT INTO failed_jobs_dlq (original_job_id, tenant_id, agent_id, agent_name, job_type, payload, error_message, status, first_failure_at, last_failure_at, failure_class, created_at)
  SELECT j.id, j.tenant_id, j.agent_id, j.agent_name, j.type, j.payload, 
    'Auto-cancelled: agent archived', 'ignored', now(), now(), 'agent_archived', now()
  FROM jobs j
  JOIN agents a ON j.agent_id = a.id
  WHERE a.archived_at IS NOT NULL
    AND j.status = 'cancelled'
    AND j.error_message = 'Auto-cancelled: agent archived'
    AND NOT EXISTS (SELECT 1 FROM failed_jobs_dlq dlq WHERE dlq.original_job_id = j.id)
  ON CONFLICT DO NOTHING;

  RETURN v_cancelled_count;
END;
$$;

-- Fix run_system_maintenance DLQ references
CREATE OR REPLACE FUNCTION public.run_system_maintenance()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb := '{}'::jsonb;
  v_stale_tasks jsonb;
  v_cancelled_jobs integer;
  v_archived_agents integer := 0;
  v_dlq_reconciled integer := 0;
  v_stale_jobs_moved integer := 0;
BEGIN
  v_stale_tasks := auto_resolve_stale_tasks();
  v_result := v_result || jsonb_build_object('stale_tasks', v_stale_tasks);

  v_cancelled_jobs := auto_cancel_archived_agent_jobs();
  v_result := v_result || jsonb_build_object('archived_agent_jobs_cancelled', v_cancelled_jobs);

  WITH archived AS (
    UPDATE agents
    SET status = 'archived', archived_at = now(), updated_at = now()
    WHERE status = 'active' AND last_heartbeat < now() - interval '2 hours'
    RETURNING id
  )
  SELECT count(*) INTO v_archived_agents FROM archived;
  v_result := v_result || jsonb_build_object('agents_archived', v_archived_agents);

  WITH reconciled AS (
    UPDATE failed_jobs_dlq dlq
    SET status = 'ignored', resolved_at = now(), resolved_by = 'system_maintenance'
    FROM jobs j
    WHERE dlq.original_job_id = j.id AND j.status = 'archived' AND dlq.status = 'pending'
    RETURNING dlq.id
  )
  SELECT count(*) INTO v_dlq_reconciled FROM reconciled;
  v_result := v_result || jsonb_build_object('dlq_reconciled', v_dlq_reconciled);

  WITH moved AS (
    UPDATE jobs
    SET status = 'failed', finished_at = now(), error_message = '[DLQ:AGENT_OFFLINE] Job queued > 2h'
    WHERE status = 'queued' AND created_at < now() - interval '2 hours'
    RETURNING id, tenant_id, agent_id, agent_name, type, payload
  )
  INSERT INTO failed_jobs_dlq (original_job_id, tenant_id, agent_id, agent_name, job_type, payload, error_message, status, first_failure_at, last_failure_at, failure_class, created_at)
  SELECT id, tenant_id, agent_id, agent_name, type, payload, '[DLQ:AGENT_OFFLINE]', 'pending', now(), now(), 'stale_queue', now()
  FROM moved ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_stale_jobs_moved = ROW_COUNT;
  v_result := v_result || jsonb_build_object('stale_jobs_moved_to_dlq', v_stale_jobs_moved);

  UPDATE tasks SET sla_breached_at = now(), updated_at = now()
  WHERE status IN ('open','in_progress') AND due_at IS NOT NULL AND due_at < now() AND sla_breached_at IS NULL;

  v_result := v_result || jsonb_build_object('executed_at', now());
  RETURN v_result;
END;
$$;
