
-- FIX: cleanup_zombie_executions marks completed-job executions as "orphaned" (false positive)
-- The function should only clean up executions for FAILED/CANCELLED jobs, not COMPLETED ones.
-- For completed jobs, the old execution is just stale data, not a failure.

CREATE OR REPLACE FUNCTION public.cleanup_zombie_executions()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_orphaned integer := 0;
  v_stale integer := 0;
  v_completed_cleanup integer := 0;
BEGIN
  -- Part 1: Orphaned executions where parent job FAILED or CANCELLED
  -- These are genuine orphans that should be marked as failed
  WITH cleaned AS (
    UPDATE job_executions
    SET 
      status = 'failed',
      finished_at = now(),
      error_message = '[CLEANUP] Orphaned execution - parent job failed/cancelled'
    WHERE status = 'running'
      AND job_id IN (
        SELECT id FROM jobs WHERE status IN ('failed', 'cancelled')
      )
    RETURNING id
  )
  SELECT count(*) INTO v_orphaned FROM cleaned;

  -- Part 2: Stale executions for COMPLETED jobs
  -- The job succeeded but the execution record wasn't finalized (race condition).
  -- Mark as 'completed' (not 'failed') since the job itself succeeded.
  WITH completed_cleanup AS (
    UPDATE job_executions
    SET 
      status = 'completed',
      finished_at = COALESCE(finished_at, now()),
      error_message = '[CLEANUP] Execution record synced with completed parent job'
    WHERE status = 'running'
      AND job_id IN (
        SELECT id FROM jobs WHERE status = 'completed'
      )
    RETURNING id
  )
  SELECT count(*) INTO v_completed_cleanup FROM completed_cleanup;

  -- Part 3: Executions running > 4h without result (genuinely stale)
  WITH stale AS (
    UPDATE job_executions
    SET 
      status = 'failed',
      finished_at = now(),
      error_message = '[CLEANUP] Execution running > 4h without result'
    WHERE status = 'running'
      AND started_at < now() - interval '4 hours'
    RETURNING id
  )
  SELECT count(*) INTO v_stale FROM stale;

  RETURN jsonb_build_object(
    'orphaned_cleaned', v_orphaned,
    'completed_synced', v_completed_cleanup,
    'stale_cleaned', v_stale,
    'total', v_orphaned + v_completed_cleanup + v_stale,
    'cleaned_at', now()
  );
END;
$$;

-- Maintain access control
REVOKE ALL ON FUNCTION public.cleanup_zombie_executions() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.cleanup_zombie_executions() TO postgres, service_role;
