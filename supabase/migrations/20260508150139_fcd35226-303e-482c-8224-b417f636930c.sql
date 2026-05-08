-- 1. Update update_agent_heartbeat_atomic with strict MVCC and temporal idempotency
CREATE OR REPLACE FUNCTION public.update_agent_heartbeat_atomic(p_agent_id uuid, p_update_data jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_heartbeat TIMESTAMPTZ;
  v_current_telemetry_at TIMESTAMPTZ;
  v_incoming_ts TIMESTAMPTZ;
BEGIN
  -- 1. Parse incoming timestamp (prefer last_telemetry_at, then update_timestamp)
  v_incoming_ts := COALESCE(
    (p_update_data->>'last_telemetry_at')::TIMESTAMPTZ,
    (p_update_data->>'update_timestamp')::TIMESTAMPTZ,
    now()
  );

  -- 2. Acquire an exclusive lock and get current state
  SELECT last_heartbeat, last_telemetry_at INTO v_current_heartbeat, v_current_telemetry_at
  FROM public.agents
  WHERE id = p_agent_id
  FOR UPDATE;

  -- 3. Update with strict conditions
  UPDATE public.agents
  SET 
    status = 'active',
    -- Only update last_heartbeat if incoming is newer or equal
    last_heartbeat = GREATEST(v_incoming_ts, COALESCE(last_heartbeat, '1970-01-01'::timestamptz)),
    row_version = COALESCE(row_version, 0) + 1, -- MVCC Increment
    
    -- Conditional metadata updates: only if incoming data is newer than what we have
    os_type = CASE 
      WHEN v_current_telemetry_at IS NULL OR v_incoming_ts >= v_current_telemetry_at 
      THEN COALESCE((p_update_data->>'os_type'), os_type) 
      ELSE os_type 
    END,
    os_version = CASE 
      WHEN v_current_telemetry_at IS NULL OR v_incoming_ts >= v_current_telemetry_at 
      THEN COALESCE((p_update_data->>'os_version'), os_version) 
      ELSE os_version 
    END,
    hostname = CASE 
      WHEN v_current_telemetry_at IS NULL OR v_incoming_ts >= v_current_telemetry_at 
      THEN COALESCE((p_update_data->>'hostname'), hostname) 
      ELSE hostname 
    END,
    agent_version = CASE 
      WHEN v_current_telemetry_at IS NULL OR v_incoming_ts >= v_current_telemetry_at 
      THEN COALESCE((p_update_data->>'agent_version'), agent_version) 
      ELSE agent_version 
    END,
    agent_state = CASE 
      WHEN v_current_telemetry_at IS NULL OR v_incoming_ts >= v_current_telemetry_at 
      THEN COALESCE((p_update_data->>'agent_state'), agent_state) 
      ELSE agent_state 
    END,
    state = CASE 
      WHEN v_current_telemetry_at IS NULL OR v_incoming_ts >= v_current_telemetry_at 
      THEN COALESCE((p_update_data->>'state'), state) 
      ELSE state 
    END,
    
    -- Always update last_telemetry_at if it's newer
    last_telemetry_at = CASE 
      WHEN p_update_data->'last_telemetry_at' IS NOT NULL 
      THEN GREATEST(v_incoming_ts, COALESCE(last_telemetry_at, '1970-01-01'::timestamptz))
      ELSE last_telemetry_at
    END,
    
    -- Capabilities & Security
    ed25519_supported = COALESCE((p_update_data->>'ed25519_supported')::BOOLEAN, ed25519_supported),
    signature_mode = COALESCE((p_update_data->>'signature_mode'), signature_mode),
    
    -- Maintenance & Updates
    skip_firewall_remediation = COALESCE((p_update_data->>'skip_firewall_remediation')::BOOLEAN, skip_firewall_remediation),
    force_update_delivered_count = COALESCE((p_update_data->>'force_update_delivered_count')::INTEGER, force_update_delivered_count),
    force_update_first_delivered_at = COALESCE((p_update_data->>'force_update_first_delivered_at')::TIMESTAMPTZ, force_update_first_delivered_at),
    last_forced_update_applied = COALESCE((p_update_data->>'last_forced_update_applied')::TIMESTAMPTZ, last_forced_update_applied)
  WHERE id = p_agent_id;
END;
$$;

-- 2. Enhance run_system_maintenance with agent_hmac_signatures cleanup
-- We'll recreate the function to include the cleanup
CREATE OR REPLACE FUNCTION public.run_system_maintenance()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  v_result jsonb := '{}'::jsonb;
  v_stale_tasks jsonb;
  v_cancelled_jobs integer;
  v_dlq_reconciled integer := 0;
  v_jobruns_cleaned integer := 0;
  v_diskmetrics_cleaned integer := 0;
  v_hmac_cleaned integer := 0;
  v_rate_limits_cleaned integer := 0;
  v_zombie_jobs integer := 0;
  v_stuck_inprogress integer := 0;
BEGIN
  -- 1. Auto-resolve stale tasks
  v_stale_tasks := auto_resolve_stale_tasks();
  v_result := v_result || jsonb_build_object('stale_tasks', v_stale_tasks);

  -- 2. Cancel jobs for archived agents
  v_cancelled_jobs := auto_cancel_archived_agent_jobs();
  v_result := v_result || jsonb_build_object('archived_agent_jobs_cancelled', v_cancelled_jobs);

  -- 3. Auto-archive disabled
  v_result := v_result || jsonb_build_object('agents_archived', 0, 'auto_archive_disabled', true);

  -- 4. Reconcile DLQ
  WITH reconciled AS (
    UPDATE failed_jobs_dlq dlq
    SET status = 'ignored', resolved_at = now(), resolved_by = 'system_maintenance'
    FROM jobs j
    WHERE dlq.original_job_id = j.id AND j.status = 'archived' AND dlq.status = 'pending'
    RETURNING dlq.id
  )
  SELECT count(*) INTO v_dlq_reconciled FROM reconciled;
  v_result := v_result || jsonb_build_object('dlq_reconciled', v_dlq_reconciled);

  -- 5. Expire zombie jobs (delivered but past TTL)
  WITH expired AS (
    UPDATE jobs
    SET status = 'failed', 
        completed_at = now(), 
        error_message = '[DLQ:EXPIRED_TTL] Job expired during maintenance sweep',
        failure_class = 'EXPIRED'
    WHERE status = 'delivered' AND expires_at IS NOT NULL AND expires_at < now()
    RETURNING id
  )
  SELECT count(*) INTO v_zombie_jobs FROM expired;
  v_result := v_result || jsonb_build_object('zombie_jobs_expired', v_zombie_jobs);

  -- 6. SLA breach detection
  UPDATE tasks SET sla_breached_at = now()
  WHERE status IN ('open','in_progress') AND due_at IS NOT NULL AND due_at < now() AND sla_breached_at IS NULL;

  -- 7. DATA RETENTION
  WITH del1 AS (
    DELETE FROM scheduled_job_runs WHERE created_at < now() - interval '30 days' RETURNING id
  ) SELECT count(*) INTO v_jobruns_cleaned FROM del1;

  WITH del2 AS (
    DELETE FROM agent_disk_metrics WHERE collected_at < now() - interval '30 days' RETURNING id
  ) SELECT count(*) INTO v_diskmetrics_cleaned FROM del2;

  -- 8. HMAC CLEANUP (Unified for both tables to be safe)
  WITH del3 AS (
    DELETE FROM agent_hmac_signatures WHERE created_at < now() - interval '24 hours' RETURNING signature
  ) SELECT count(*) INTO v_hmac_cleaned FROM del3;
  
  -- Also clean the older hmac_signatures table if it still has data
  DELETE FROM hmac_signatures WHERE used_at < now() - interval '7 days';

  -- 9. RATE LIMITS CLEANUP
  WITH del4 AS (
    DELETE FROM rate_limits WHERE window_start < now() - interval '1 hour' AND blocked_until IS NULL RETURNING id
  ) SELECT count(*) INTO v_rate_limits_cleaned FROM del4;

  v_result := v_result || jsonb_build_object(
    'data_retention', jsonb_build_object(
      'job_runs_purged', v_jobruns_cleaned,
      'disk_metrics_purged', v_diskmetrics_cleaned,
      'hmac_signatures_purged', v_hmac_cleaned,
      'rate_limits_purged', v_rate_limits_cleaned
    )
  );

  -- 10. Auto-resolve stuck in_progress tasks (>14 days)
  WITH stuck AS (
    UPDATE tasks 
    SET status = 'resolved', 
        closed_at = now(),
        closure_reason = 'auto_resolved_maintenance_stuck_14d',
        updated_at = now()
    WHERE status = 'in_progress' 
      AND updated_at < now() - interval '14 days'
    RETURNING id
  )
  SELECT count(*) INTO v_stuck_inprogress FROM stuck;
  v_result := v_result || jsonb_build_object('stuck_inprogress_resolved', v_stuck_inprogress);

  v_result := v_result || jsonb_build_object('executed_at', now());
  RETURN v_result;
END;
$$;
