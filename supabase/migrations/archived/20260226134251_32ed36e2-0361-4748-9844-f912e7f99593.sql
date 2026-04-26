
-- Function to auto-cleanup stale DLQ items and stale delivered jobs
CREATE OR REPLACE FUNCTION public.auto_cleanup_stale_operations()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  dlq_cleaned int := 0;
  jobs_cancelled int := 0;
BEGIN
  -- 1. Auto-resolve DLQ items pending > 6 hours
  WITH resolved AS (
    UPDATE failed_jobs_dlq 
    SET status = 'resolved',
        resolved_at = now(),
        resolution_notes = 'Auto-cleanup: item pendente por mais de 6h',
        resolution_source = 'auto_cleanup'
    WHERE status = 'pending' 
      AND created_at < now() - interval '6 hours'
    RETURNING id
  )
  SELECT count(*) INTO dlq_cleaned FROM resolved;

  -- 2. Cancel delivered jobs for offline/inactive agents (stale > 1h)
  WITH cancelled AS (
    UPDATE jobs 
    SET status = 'cancelled', completed_at = now()
    WHERE status = 'delivered' 
      AND completed_at IS NULL
      AND created_at < now() - interval '1 hour'
      AND agent_id IN (
        SELECT id FROM agents WHERE status IN ('offline', 'inactive')
      )
    RETURNING id
  )
  SELECT count(*) INTO jobs_cancelled FROM cancelled;

  RETURN jsonb_build_object(
    'dlq_cleaned', dlq_cleaned,
    'jobs_cancelled', jobs_cancelled,
    'executed_at', now()
  );
END;
$$;

-- Schedule auto-cleanup every 30 minutes
SELECT cron.unschedule('auto-cleanup-stale-operations')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto-cleanup-stale-operations');

SELECT cron.schedule(
  'auto-cleanup-stale-operations',
  '*/30 * * * *',
  $$SELECT public.auto_cleanup_stale_operations()$$
);
