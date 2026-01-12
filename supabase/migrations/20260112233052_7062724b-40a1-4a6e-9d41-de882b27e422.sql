-- =============================================================================
-- Fix: v_cron_silent_failures to use correct column names from scheduled_job_runs
-- =============================================================================

DROP VIEW IF EXISTS public.v_cron_silent_failures;

CREATE VIEW public.v_cron_silent_failures 
WITH (security_invoker = on)
AS
SELECT 
  sj.id,
  sj.tenant_id,
  sj.job_key,
  sj.name as job_name,
  sj.job_type,
  sj.cron_expr,
  sj.last_run_at,
  (
    SELECT MAX(sjr.ran_at) 
    FROM scheduled_job_runs sjr 
    WHERE sjr.job_key = sj.job_key 
      AND sjr.success = true
  ) as last_successful_run,
  NOW() - COALESCE(
    (SELECT MAX(sjr.ran_at) FROM scheduled_job_runs sjr WHERE sjr.job_key = sj.job_key AND sjr.success = true),
    sj.created_at
  ) as silence_duration,
  CASE 
    WHEN (SELECT MAX(sjr.ran_at) FROM scheduled_job_runs sjr WHERE sjr.job_key = sj.job_key AND sjr.success = true) IS NULL THEN 'NEVER_RAN'
    WHEN NOW() - (SELECT MAX(sjr.ran_at) FROM scheduled_job_runs sjr WHERE sjr.job_key = sj.job_key AND sjr.success = true) > INTERVAL '4 hours' THEN 'STALE'
    ELSE 'OK'
  END as health_status
FROM scheduled_jobs sj
WHERE sj.enabled = true;

COMMENT ON VIEW public.v_cron_silent_failures IS 
'View to detect cron jobs that have silently failed. Fixed to use correct column names: ran_at, success instead of started_at, status.';

-- Backfill more fingerprints
DO $$
DECLARE
  v_updated int;
  v_batch int := 1;
BEGIN
  LOOP
    WITH tasks_to_update AS (
      SELECT id FROM tasks 
      WHERE semantic_fingerprint IS NULL 
      AND source_type IS NOT NULL
      LIMIT 500
    )
    UPDATE tasks t
    SET updated_at = NOW()
    FROM tasks_to_update ttu
    WHERE t.id = ttu.id;
    
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    EXIT WHEN v_updated = 0;
    v_batch := v_batch + 1;
    EXIT WHEN v_batch > 10; -- Max 5000 tasks
  END LOOP;
  RAISE NOTICE 'Backfill completed after % batches', v_batch - 1;
END $$;