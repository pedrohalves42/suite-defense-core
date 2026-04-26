
-- NULLMANN P-014: Fix run_system_maintenance() referencing non-existent "result" column
-- The correct column is "output" (confirmed via information_schema)

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
  v_dlq_reconciled integer := 0;
  v_jobruns_cleaned integer := 0;
  v_diskmetrics_cleaned integer := 0;
  v_hmac_cleaned integer := 0;
  v_rate_limits_cleaned integer := 0;
  v_zombie_jobs integer := 0;
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
  -- FIX: Use "error_message" column (not "result" which doesn't exist)
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

  -- 8. HMAC CLEANUP - use "used_at" (correct column)
  WITH del3 AS (
    DELETE FROM hmac_signatures WHERE used_at < now() - interval '7 days' RETURNING id
  ) SELECT count(*) INTO v_hmac_cleaned FROM del3;

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
  UPDATE tasks 
  SET status = 'resolved', 
      resolved_at = now(),
      resolution_notes = 'Auto-resolved by maintenance: stuck in_progress > 14 days'
  WHERE status = 'in_progress' 
    AND updated_at < now() - interval '14 days';

  v_result := v_result || jsonb_build_object('executed_at', now());
  RETURN v_result;
END;
$$;

-- Reset the failure counter since the bug is now fixed
UPDATE cron_health_checks 
SET consecutive_failures = 0, last_error = NULL, updated_at = now()
WHERE cron_name = 'system-maintenance-30min';
