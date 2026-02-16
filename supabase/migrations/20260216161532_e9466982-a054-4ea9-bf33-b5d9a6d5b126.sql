
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
  -- 1) Expire jobs past TTL
  WITH expired AS (
    UPDATE jobs
    SET status = 'timeout'
    WHERE id IN (
      SELECT id FROM jobs
      WHERE status IN ('pending', 'queued', 'delivered', 'running')
        AND expires_at < v_now
      LIMIT p_expire_limit
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id
  )
  SELECT count(*) INTO v_expired_count FROM expired;

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

REVOKE ALL ON FUNCTION public.run_maintenance_v2(int, int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.run_maintenance_v2(int, int) TO service_role;
