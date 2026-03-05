
-- Update run_maintenance_v2 to use 'expired' status instead of 'cancelled'/'failed'
CREATE OR REPLACE FUNCTION run_maintenance_v2(p_expire_limit int DEFAULT 500, p_archive_limit int DEFAULT 1000)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expired_count int := 0;
  v_archived_count int := 0;
  v_cleaned_count int := 0;
  v_orphan_tasks_count int := 0;
  v_stale_crons_count int := 0;
  v_now timestamptz := now();
  v_thirty_days_ago timestamptz := now() - interval '30 days';
BEGIN
  -- Expire pending/queued jobs past TTL
  WITH expired AS (
    UPDATE jobs SET status = 'expired'
    WHERE id IN (
      SELECT id FROM jobs WHERE status IN ('pending', 'queued') AND expires_at < v_now
      LIMIT p_expire_limit FOR UPDATE SKIP LOCKED
    ) RETURNING id
  ) SELECT count(*) INTO v_expired_count FROM expired;

  -- Expire delivered jobs past TTL
  WITH expired_delivered AS (
    UPDATE jobs SET status = 'expired'
    WHERE id IN (
      SELECT id FROM jobs WHERE status = 'delivered' AND expires_at < v_now
      LIMIT p_expire_limit FOR UPDATE SKIP LOCKED
    ) RETURNING id
  ) SELECT v_expired_count + count(*) INTO v_expired_count FROM expired_delivered;

  -- Archive old executions
  WITH archived AS (
    UPDATE job_executions SET archived_at = v_now
    WHERE id IN (
      SELECT id FROM job_executions
      WHERE archived_at IS NULL AND created_at < v_thirty_days_ago
      LIMIT p_archive_limit FOR UPDATE SKIP LOCKED
    ) RETURNING id
  ) SELECT count(*) INTO v_archived_count FROM archived;

  -- Clean stale force_update flags
  WITH stale AS (
    UPDATE agents a
    SET force_update_version = NULL, force_update_reason = NULL,
        force_update_delivered_count = 0, force_update_first_delivered_at = NULL
    WHERE a.force_update_version IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM agent_releases ar WHERE ar.version = a.force_update_version AND ar.is_active = true)
    RETURNING a.id
  ) SELECT count(*) INTO v_cleaned_count FROM stale;

  -- Resolve orphan tasks (unassigned, open > 24h)
  WITH orphans AS (
    UPDATE tasks SET status = 'resolved', updated_at = v_now
    WHERE assigned_to IS NULL
      AND status NOT IN ('completed', 'cancelled', 'resolved')
      AND created_at < v_now - interval '24 hours'
    RETURNING id
  ) SELECT count(*) INTO v_orphan_tasks_count FROM orphans;

  -- Exhaust stale DLQ entries (pending > 48h)
  WITH exhausted_dlq AS (
    UPDATE failed_jobs_dlq SET status = 'exhausted'
    WHERE status = 'pending' AND created_at < v_now - interval '48 hours'
    RETURNING id
  ) SELECT count(*) FROM exhausted_dlq;

  -- Detect stale crons
  SELECT COUNT(*) INTO v_stale_crons_count
  FROM cron_health
  WHERE last_success_at < v_now - interval '4 hours'
    AND consecutive_failures = 0;

  IF v_stale_crons_count > 0 THEN
    INSERT INTO system_alerts (tenant_id, alert_type, severity, title, message, source)
    SELECT DISTINCT ur.tenant_id, 'stale_cron', 'critical',
      'Cron Silencioso Detectado',
      format('Cron "%s" sem sucesso há 4h+', ch.cron_name),
      'zero-gap-monitor'
    FROM cron_health ch
    CROSS JOIN (SELECT DISTINCT tenant_id FROM user_roles WHERE role = 'admin' LIMIT 1) ur
    WHERE ch.last_success_at < v_now - interval '4 hours' AND ch.consecutive_failures = 0;
  END IF;

  -- Update cron health
  UPDATE cron_health 
  SET consecutive_failures = 0, last_success_at = v_now, last_error = NULL
  WHERE cron_name = 'maintenance-cron';

  RETURN jsonb_build_object(
    'expired_jobs', v_expired_count,
    'archived_executions', v_archived_count,
    'cleaned_force_updates', v_cleaned_count,
    'orphan_tasks_resolved', v_orphan_tasks_count,
    'stale_crons_detected', v_stale_crons_count,
    'executed_at', v_now
  );
END;
$$;
