
-- Re-apply: Drop unused indexes (confirmed 0 scans)
DROP INDEX IF EXISTS idx_evidence_hash;
DROP INDEX IF EXISTS idx_evidence_severity;
DROP INDEX IF EXISTS idx_jobs_finished_at;
DROP INDEX IF EXISTS idx_audit_logs_user;
DROP INDEX IF EXISTS idx_audit_logs_request_id;

-- Drop empty partitions (confirmed 0 rows)
DROP TABLE IF EXISTS hmac_signatures_2025_12;
DROP TABLE IF EXISTS hmac_signatures_2026_01;

-- Autovacuum tuning
ALTER TABLE agent_evidence_logs SET (autovacuum_vacuum_scale_factor = 0.1);
ALTER TABLE agent_evidence_logs SET (autovacuum_analyze_scale_factor = 0.05);
ALTER TABLE scheduled_job_runs SET (autovacuum_vacuum_scale_factor = 0.1);
ALTER TABLE scheduled_job_runs SET (autovacuum_analyze_scale_factor = 0.05);

-- Composite index for hot queries
CREATE INDEX IF NOT EXISTS idx_jobs_status_created
ON jobs(status, created_at DESC)
WHERE status IN ('pending', 'queued', 'running');

-- Update run_system_maintenance with data retention (excluding immutable audit tables)
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

  -- 5. Stale jobs note
  v_result := v_result || jsonb_build_object('stale_jobs_note', 'handled_by_cleanup_stuck_jobs_ef');

  -- 6. SLA breach detection
  UPDATE tasks SET sla_breached_at = now()
  WHERE status IN ('open','in_progress') AND due_at IS NOT NULL AND due_at < now() AND sla_breached_at IS NULL;

  -- 7. DATA RETENTION (tables without audit triggers)
  WITH del1 AS (
    DELETE FROM scheduled_job_runs WHERE created_at < now() - interval '30 days' RETURNING id
  ) SELECT count(*) INTO v_jobruns_cleaned FROM del1;

  WITH del2 AS (
    DELETE FROM agent_disk_metrics WHERE collected_at < now() - interval '30 days' RETURNING id
  ) SELECT count(*) INTO v_diskmetrics_cleaned FROM del2;

  v_result := v_result || jsonb_build_object(
    'data_retention', jsonb_build_object(
      'job_runs_purged', v_jobruns_cleaned,
      'disk_metrics_purged', v_diskmetrics_cleaned,
      'evidence_logs_note', 'immutable_soc2_compliance'
    )
  );

  v_result := v_result || jsonb_build_object('executed_at', now());
  RETURN v_result;
END;
$$;
