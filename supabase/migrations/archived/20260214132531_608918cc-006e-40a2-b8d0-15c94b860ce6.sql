-- Fix run_system_maintenance step 10: uses non-existent columns resolved_at/resolution_notes
-- Correct columns are closed_at/closure_reason
CREATE OR REPLACE FUNCTION run_system_maintenance()
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

  -- 8. HMAC CLEANUP
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
  -- FIX: Use correct columns closed_at/closure_reason (not resolved_at/resolution_notes)
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