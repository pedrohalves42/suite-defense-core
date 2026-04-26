
-- Fix auto_cancel_archived_agent_jobs: jobs has no updated_at column
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
    RETURNING j.id, j.tenant_id, j.agent_id
  )
  SELECT count(*) INTO v_cancelled_count FROM cancelled;

  -- Also add to DLQ
  INSERT INTO dead_letter_queue (job_id, tenant_id, agent_id, original_status, failure_reason, category, created_at)
  SELECT j.id, j.tenant_id, j.agent_id, j.status, '[DLQ:AGENT_ARCHIVED] Auto-cancelled', 'agent_archived', now()
  FROM jobs j
  JOIN agents a ON j.agent_id = a.id
  WHERE a.archived_at IS NOT NULL
    AND j.status = 'cancelled'
    AND j.error_message = 'Auto-cancelled: agent archived'
    AND NOT EXISTS (SELECT 1 FROM dead_letter_queue dlq WHERE dlq.job_id = j.id)
  ON CONFLICT DO NOTHING;

  RETURN v_cancelled_count;
END;
$$;

-- Fix run_system_maintenance: jobs has no updated_at
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
  -- Step 1: Auto-resolve stale tasks
  v_stale_tasks := auto_resolve_stale_tasks();
  v_result := v_result || jsonb_build_object('stale_tasks', v_stale_tasks);

  -- Step 2: Cancel jobs assigned to archived agents
  v_cancelled_jobs := auto_cancel_archived_agent_jobs();
  v_result := v_result || jsonb_build_object('archived_agent_jobs_cancelled', v_cancelled_jobs);

  -- Step 3: Archive inactive agents (no heartbeat > 2 hours)
  WITH archived AS (
    UPDATE agents
    SET status = 'archived',
        archived_at = now(),
        updated_at = now()
    WHERE status = 'active'
      AND last_heartbeat < now() - interval '2 hours'
    RETURNING id
  )
  SELECT count(*) INTO v_archived_agents FROM archived;
  v_result := v_result || jsonb_build_object('agents_archived', v_archived_agents);

  -- Step 4: Reconcile DLQ for already-archived jobs
  WITH reconciled AS (
    UPDATE dead_letter_queue dlq
    SET status = 'ignored',
        resolved_at = now(),
        resolved_by = 'system_maintenance'
    FROM jobs j
    WHERE dlq.job_id = j.id
      AND j.status = 'archived'
      AND dlq.status = 'pending'
    RETURNING dlq.id
  )
  SELECT count(*) INTO v_dlq_reconciled FROM reconciled;
  v_result := v_result || jsonb_build_object('dlq_reconciled', v_dlq_reconciled);

  -- Step 5: Move stale queued jobs to DLQ
  WITH moved AS (
    UPDATE jobs
    SET status = 'failed',
        finished_at = now(),
        error_message = '[DLQ:AGENT_OFFLINE] Job queued > 2h without pickup'
    WHERE status = 'queued'
      AND created_at < now() - interval '2 hours'
    RETURNING id, tenant_id, agent_id
  )
  INSERT INTO dead_letter_queue (job_id, tenant_id, agent_id, original_status, failure_reason, category, created_at)
  SELECT id, tenant_id, agent_id, 'queued', '[DLQ:AGENT_OFFLINE] Job queued > 2h without agent pickup', 'stale_queue', now()
  FROM moved
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_stale_jobs_moved = ROW_COUNT;
  v_result := v_result || jsonb_build_object('stale_jobs_moved_to_dlq', v_stale_jobs_moved);

  -- Step 6: Close expired SLA tasks
  UPDATE tasks
  SET sla_breached_at = now(),
      updated_at = now()
  WHERE status IN ('open', 'in_progress')
    AND due_at IS NOT NULL
    AND due_at < now()
    AND sla_breached_at IS NULL;

  v_result := v_result || jsonb_build_object('executed_at', now());

  RETURN v_result;
END;
$$;
