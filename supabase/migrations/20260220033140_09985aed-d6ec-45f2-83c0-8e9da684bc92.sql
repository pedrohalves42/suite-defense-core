
-- Fix run_maintenance_v2: use 'cancelled' instead of 'timeout' for expired jobs
-- The state machine only allows: pending→{queued,delivered,cancelled,failed}
-- 'timeout' is not a valid state. Expired jobs should be 'cancelled' (TTL exceeded).
CREATE OR REPLACE FUNCTION public.run_maintenance_v2(
  p_expire_limit int DEFAULT 500,
  p_archive_limit int DEFAULT 1000
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expired_count int := 0;
  v_archived_count int := 0;
  v_cleaned_count int := 0;
  v_now timestamptz := now();
  v_thirty_days_ago timestamptz := now() - interval '30 days';
BEGIN
  -- 1) Expire jobs past TTL → mark as 'cancelled' (valid state transition)
  WITH expired AS (
    UPDATE jobs
    SET status = 'cancelled'
    WHERE id IN (
      SELECT id FROM jobs
      WHERE status IN ('pending', 'queued')
        AND expires_at < v_now
      LIMIT p_expire_limit
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id
  )
  SELECT count(*) INTO v_expired_count FROM expired;

  -- 1b) Handle delivered jobs past TTL → mark as 'failed' (delivered→failed is valid)
  WITH expired_delivered AS (
    UPDATE jobs
    SET status = 'failed'
    WHERE id IN (
      SELECT id FROM jobs
      WHERE status = 'delivered'
        AND expires_at < v_now
      LIMIT p_expire_limit
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id
  )
  SELECT v_expired_count + count(*) INTO v_expired_count FROM expired_delivered;

  -- 2) Archive old executions (>30 days)
  WITH archived AS (
    UPDATE job_executions
    SET archived_at = v_now
    WHERE id IN (
      SELECT id FROM job_executions
      WHERE archived_at IS NULL
        AND created_at < v_thirty_days_ago
      LIMIT p_archive_limit
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id
  )
  SELECT count(*) INTO v_archived_count FROM archived;

  -- 3) Clean stale force_update flags
  WITH stale AS (
    UPDATE agents a
    SET force_update_version = NULL,
        force_update_reason = NULL,
        force_update_delivered_count = 0,
        force_update_first_delivered_at = NULL
    WHERE a.force_update_version IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM agent_releases ar
        WHERE ar.version = a.force_update_version
          AND ar.is_active = true
      )
    RETURNING a.id
  )
  SELECT count(*) INTO v_cleaned_count FROM stale;

  RETURN jsonb_build_object(
    'expired_jobs', v_expired_count,
    'archived_executions', v_archived_count,
    'stale_flags_cleaned', v_cleaned_count
  );
END;
$$;

-- Maintain access control
REVOKE ALL ON FUNCTION public.run_maintenance_v2(int, int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.run_maintenance_v2(int, int) TO postgres, service_role;

-- Also reset the consecutive failures counter so the cron starts clean
UPDATE cron_health_checks 
SET consecutive_failures = 0, last_error = NULL, updated_at = now()
WHERE cron_name IN ('maintenance-cron', 'cleanup-old-data-hourly');
