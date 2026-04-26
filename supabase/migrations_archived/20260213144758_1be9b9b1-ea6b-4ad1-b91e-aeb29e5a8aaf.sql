
-- =====================================================
-- FIX: sync_task_on_dlq_resolution trigger
-- closed_by is UUID but resolved_by is TEXT
-- Fix: cast to NULL when resolved_by is not a valid UUID
-- =====================================================
CREATE OR REPLACE FUNCTION sync_task_on_dlq_resolution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'resolved' AND COALESCE(OLD.status, '') != 'resolved' THEN
    UPDATE public.tasks
    SET
      status = 'resolved',
      closed_at = COALESCE(NEW.resolved_at, NOW()),
      closed_by = CASE 
        WHEN NEW.resolved_by IS NOT NULL AND NEW.resolved_by ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN NEW.resolved_by::uuid
        ELSE NULL
      END,
      closure_reason = COALESCE(NEW.resolution_notes, 'DLQ item resolvido'),
      updated_at = NOW()
    WHERE source_type = 'dlq'
      AND source_id = NEW.id
      AND status NOT IN ('resolved', 'closed');
  END IF;
  RETURN NEW;
END;
$$;

-- =====================================================
-- P0-FIX-1: Disable duplicate cleanup crons
-- =====================================================
SELECT cron.unschedule(jobid) FROM cron.job WHERE command LIKE '%cleanup_stuck_jobs_v2%';
SELECT cron.unschedule(jobid) FROM cron.job WHERE command LIKE '%auto_cancel_zombie_jobs%';

-- =====================================================
-- P0-FIX-2: Update run_system_maintenance - remove duplicate step 5
-- =====================================================
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
BEGIN
  -- 1. Auto-resolve stale tasks
  v_stale_tasks := auto_resolve_stale_tasks();
  v_result := v_result || jsonb_build_object('stale_tasks', v_stale_tasks);

  -- 2. Cancel jobs for ALREADY archived agents
  v_cancelled_jobs := auto_cancel_archived_agent_jobs();
  v_result := v_result || jsonb_build_object('archived_agent_jobs_cancelled', v_cancelled_jobs);

  -- 3. Auto-archive agents REMOVED
  v_result := v_result || jsonb_build_object('agents_archived', 0, 'auto_archive_disabled', true);

  -- 4. Reconcile DLQ entries for archived agents
  WITH reconciled AS (
    UPDATE failed_jobs_dlq dlq
    SET status = 'ignored', resolved_at = now(), resolved_by = 'system_maintenance'
    FROM jobs j
    WHERE dlq.original_job_id = j.id AND j.status = 'archived' AND dlq.status = 'pending'
    RETURNING dlq.id
  )
  SELECT count(*) INTO v_dlq_reconciled FROM reconciled;
  v_result := v_result || jsonb_build_object('dlq_reconciled', v_dlq_reconciled);

  -- 5. REMOVED: Stale queued jobs cleanup (duplicate of cleanup-stuck-jobs EF)
  v_result := v_result || jsonb_build_object('stale_jobs_note', 'handled_by_cleanup_stuck_jobs_ef');

  -- 6. SLA breach detection
  UPDATE tasks SET sla_breached_at = now()
  WHERE status IN ('open','in_progress') AND due_at IS NOT NULL AND due_at < now() AND sla_breached_at IS NULL;

  v_result := v_result || jsonb_build_object('executed_at', now());
  RETURN v_result;
END;
$$;

-- =====================================================
-- P1-FIX-1: Bulk resolve irrecoverable DLQ entries
-- =====================================================
UPDATE failed_jobs_dlq
SET status = 'resolved',
    resolved_at = now(),
    resolved_by = 'p1_bulk_cleanup_20260213'
WHERE status = 'pending'
  AND failure_class IN ('AGENT_OFFLINE', 'AGENT_STALLED', 'BUG', 'POLICY');

-- =====================================================
-- P0-FIX-3: Fail currently stuck jobs past TTL
-- =====================================================
UPDATE jobs
SET status = 'failed',
    error_message = '[CLEANUP] Job expired (TTL exceeded) - P0 remediation',
    completed_at = now()
WHERE status IN ('queued', 'delivered')
  AND expires_at IS NOT NULL
  AND expires_at < now();

-- =====================================================
-- P0-FIX-4: Fail queued/delivered jobs for inactive agents
-- =====================================================
UPDATE jobs j
SET status = 'failed',
    error_message = '[DLQ:AGENT_INACTIVE] Agent is inactive',
    completed_at = now()
FROM agents a
WHERE j.agent_id = a.id
  AND j.status IN ('queued', 'delivered')
  AND a.status = 'inactive';
