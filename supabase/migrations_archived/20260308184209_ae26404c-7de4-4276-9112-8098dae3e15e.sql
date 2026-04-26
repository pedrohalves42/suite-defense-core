CREATE OR REPLACE FUNCTION public.run_maintenance_v2(
  p_expire_limit integer DEFAULT 500,
  p_archive_limit integer DEFAULT 1000
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expired_jobs integer := 0;
  v_archived_executions integer := 0;
  v_stale_flags_cleaned integer := 0;
  v_retriggered_agents integer := 0;
BEGIN
  -- 1. Expire jobs that exceeded TTL (4h default + 2h buffer = 6h)
  WITH candidates AS (
    SELECT id FROM jobs
    WHERE status IN ('pending', 'queued', 'delivered', 'running')
      AND created_at < now() - interval '6 hours'
    LIMIT p_expire_limit
  ),
  expired AS (
    UPDATE jobs SET status = 'expired', updated_at = now()
    FROM candidates WHERE jobs.id = candidates.id
    RETURNING jobs.id
  )
  SELECT count(*) INTO v_expired_jobs FROM expired;

  -- 2. Archive old execution records (> 30 days)
  WITH candidates AS (
    SELECT id FROM job_execution_results
    WHERE created_at < now() - interval '30 days'
    LIMIT p_archive_limit
  ),
  archived AS (
    DELETE FROM job_execution_results
    USING candidates WHERE job_execution_results.id = candidates.id
    RETURNING job_execution_results.id
  )
  SELECT count(*) INTO v_archived_executions FROM archived;

  -- 3. Clean stale force_update flags (delivered but not applied after 48h)
  WITH cleaned AS (
    UPDATE agents
    SET force_update_at = NULL,
        force_update_delivered_count = 0,
        force_update_delivery_count = 0
    WHERE force_update_at IS NOT NULL
      AND force_update_at < now() - interval '48 hours'
      AND force_update_delivered_count >= 3
    RETURNING id
  )
  SELECT count(*) INTO v_stale_flags_cleaned FROM cleaned;

  -- 4. Re-trigger force_update for agents offline > 72h with outdated version
  -- CRITICAL: Does NOT auto-archive/inactivate agents
  WITH retriggered AS (
    UPDATE agents a
    SET force_update_at = now(),
        force_update_reason = 'auto_retrigger_72h_offline',
        force_update_delivered_count = 0,
        force_update_delivery_count = 0
    WHERE a.force_update_at IS NULL
      AND a.last_heartbeat < now() - interval '72 hours'
      AND a.last_heartbeat IS NOT NULL
      AND a.is_active = true
      AND a.agent_version IS DISTINCT FROM (
        SELECT ar.version 
        FROM agent_releases ar
        WHERE ar.is_active = true 
          AND ar.platform = COALESCE(a.os_type, 'windows')
        ORDER BY ar.created_at DESC 
        LIMIT 1
      )
    RETURNING a.id
  )
  SELECT count(*) INTO v_retriggered_agents FROM retriggered;

  -- 5. Auto-expire stale DLQ items (> 48h pending)
  UPDATE failed_jobs_dlq
  SET status = 'exhausted', updated_at = now()
  WHERE status = 'pending'
    AND created_at < now() - interval '48 hours';

  -- 6. Auto-resolve stale open tasks (> 48h)
  UPDATE tasks
  SET status = 'resolved', resolution = 'auto_expired_stale',
      resolved_at = now(), updated_at = now()
  WHERE status = 'open'
    AND created_at < now() - interval '48 hours';

  RETURN jsonb_build_object(
    'expired_jobs', v_expired_jobs,
    'archived_executions', v_archived_executions,
    'stale_flags_cleaned', v_stale_flags_cleaned,
    'retriggered_agents', v_retriggered_agents
  );
END;
$$;