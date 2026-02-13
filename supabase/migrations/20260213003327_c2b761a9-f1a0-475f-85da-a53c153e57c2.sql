
-- FIX 1: run_system_maintenance references "updated_at" which doesn't exist on agents table
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

  -- FIX: agents table has no "updated_at" column
  WITH archived AS (
    UPDATE agents
    SET status = 'archived', archived_at = now()
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

  UPDATE tasks SET sla_breached_at = now()
  WHERE status IN ('open','in_progress') AND due_at IS NOT NULL AND due_at < now() AND sla_breached_at IS NULL;

  v_result := v_result || jsonb_build_object('executed_at', now());
  RETURN v_result;
END;
$$;

-- FIX 2: evaluate_software_risk references "last_heartbeat_at" instead of "last_heartbeat"
-- Find and fix the function that uses this column
CREATE OR REPLACE FUNCTION public.evaluate_software_risk_all_agents()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agent RECORD;
  v_count integer := 0;
  v_errors integer := 0;
BEGIN
  FOR v_agent IN 
    SELECT id, tenant_id, hostname
    FROM agents 
    WHERE archived_at IS NULL AND status = 'active'
    ORDER BY last_heartbeat DESC
  LOOP
    BEGIN
      -- Evaluate risk for each active agent
      PERFORM evaluate_software_risk(v_agent.id);
      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors + 1;
      RAISE WARNING 'Failed to evaluate risk for agent %: %', v_agent.id, SQLERRM;
    END;
  END LOOP;
  
  RETURN jsonb_build_object(
    'agents_evaluated', v_count,
    'errors', v_errors,
    'executed_at', now()
  );
END;
$$;

-- FIX 3: detect_blocked_attempts - recreate if missing or broken
CREATE OR REPLACE FUNCTION public.detect_blocked_attempts()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  -- Detect suspicious blocked login/access attempts in the last 5 minutes
  WITH blocked AS (
    SELECT tenant_id, COUNT(*) as attempt_count
    FROM security_logs
    WHERE created_at > now() - interval '5 minutes'
      AND action IN ('LOGIN_FAILED', 'ACCESS_DENIED', 'BLOCKED')
    GROUP BY tenant_id
    HAVING COUNT(*) >= 5
  )
  INSERT INTO tasks (tenant_id, source_type, title, description, severity, status, auto_generated)
  SELECT 
    b.tenant_id,
    'system_alert',
    '🚨 Blocked access attempts detected - ' || b.attempt_count || ' in 5min',
    'Multiple blocked access attempts detected. Investigate potential brute force or unauthorized access.',
    CASE WHEN b.attempt_count >= 20 THEN 'critical' ELSE 'high' END,
    'open',
    true
  FROM blocked b
  WHERE NOT EXISTS (
    SELECT 1 FROM tasks t 
    WHERE t.tenant_id = b.tenant_id 
      AND t.source_type = 'system_alert'
      AND t.title LIKE '%Blocked access%'
      AND t.status = 'open'
      AND t.created_at > now() - interval '1 hour'
  );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  
  RETURN jsonb_build_object('alerts_created', v_count, 'executed_at', now());
END;
$$;

-- FIX 4: refresh_incident_slos - recreate if missing or broken
CREATE OR REPLACE FUNCTION public.refresh_incident_slos()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_breached integer := 0;
BEGIN
  -- Mark SLA breaches for open tasks past due
  WITH breached AS (
    UPDATE tasks 
    SET sla_breached_at = now()
    WHERE status IN ('open', 'in_progress')
      AND due_at IS NOT NULL 
      AND due_at < now()
      AND sla_breached_at IS NULL
    RETURNING id
  )
  SELECT count(*) INTO v_breached FROM breached;
  
  RETURN jsonb_build_object('sla_breaches_marked', v_breached, 'executed_at', now());
END;
$$;
