
-- =============================================================================
-- ZERO-GAP FIX v2: Corrigido para cron_health.status ser generated column
-- =============================================================================

-- FIX 1: Default para alert_type + corrigir run_maintenance_v2
ALTER TABLE public.system_alerts 
  ALTER COLUMN alert_type SET DEFAULT 'system_maintenance';

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
  v_orphan_tasks_count int := 0;
  v_stale_crons_count int := 0;
  v_now timestamptz := now();
  v_thirty_days_ago timestamptz := now() - interval '30 days';
BEGIN
  WITH expired AS (
    UPDATE jobs SET status = 'cancelled'
    WHERE id IN (
      SELECT id FROM jobs WHERE status IN ('pending', 'queued') AND expires_at < v_now
      LIMIT p_expire_limit FOR UPDATE SKIP LOCKED
    ) RETURNING id
  ) SELECT count(*) INTO v_expired_count FROM expired;

  WITH expired_delivered AS (
    UPDATE jobs SET status = 'failed'
    WHERE id IN (
      SELECT id FROM jobs WHERE status = 'delivered' AND expires_at < v_now
      LIMIT p_expire_limit FOR UPDATE SKIP LOCKED
    ) RETURNING id
  ) SELECT v_expired_count + count(*) INTO v_expired_count FROM expired_delivered;

  WITH archived AS (
    UPDATE job_executions SET archived_at = v_now
    WHERE id IN (
      SELECT id FROM job_executions
      WHERE archived_at IS NULL AND created_at < v_thirty_days_ago
      LIMIT p_archive_limit FOR UPDATE SKIP LOCKED
    ) RETURNING id
  ) SELECT count(*) INTO v_archived_count FROM archived;

  WITH stale AS (
    UPDATE agents a
    SET force_update_version = NULL, force_update_reason = NULL,
        force_update_delivered_count = 0, force_update_first_delivered_at = NULL
    WHERE a.force_update_version IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM agent_releases ar WHERE ar.version = a.force_update_version AND ar.is_active = true)
    RETURNING a.id
  ) SELECT count(*) INTO v_cleaned_count FROM stale;

  WITH orphans AS (
    UPDATE tasks SET status = 'resolved', updated_at = v_now
    WHERE assigned_to IS NULL
      AND status NOT IN ('completed', 'cancelled', 'resolved')
      AND created_at < v_now - interval '24 hours'
    RETURNING id
  ) SELECT count(*) INTO v_orphan_tasks_count FROM orphans;

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

  -- Reset consecutive_failures (status is generated from this)
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

-- FIX 2: Evidence logs - add INSERT trigger (existing one only fires on UPDATE)
DROP TRIGGER IF EXISTS trg_auto_create_evidence_on_insert ON job_executions;
CREATE TRIGGER trg_auto_create_evidence_on_insert
  AFTER INSERT ON public.job_executions
  FOR EACH ROW
  WHEN (NEW.status IN ('completed', 'failed'))
  EXECUTE FUNCTION auto_create_evidence_from_execution();

-- FIX 3: Revoke internal trigger functions from authenticated/anon/public
DO $$
DECLARE
  fn_name text;
  internal_fns text[] := ARRAY[
    'auto_create_evidence_from_execution',
    'auto_evaluate_playbook_on_alert', 
    'auto_provision_signing_key',
    'emit_agent_status_domain_event',
    'emit_alert_domain_event',
    'emit_job_domain_event',
    'auto_cancel_jobs_on_agent_offline',
    'auto_pause_scheduling_on_inactive',
    'auto_mark_agents_inactive',
    'auto_insert_failed_job_to_dlq',
    'auto_classify_job_failure',
    'auto_set_job_payload_hash',
    'auto_populate_agent_id',
    'auto_create_tenant_settings',
    'auto_close_stale_orphan_tasks',
    'auto_collect_task_evidence',
    'auto_create_task_for_critical_alert',
    'auto_resolve_resource_alerts',
    'auto_resolve_stale_tasks',
    'auto_activate_emergency_mode',
    'auto_approve_safe_actions',
    'auto_cancel_archived_agent_jobs',
    'alert_on_integrity_breach',
    'calculate_audit_log_hash',
    'cancel_jobs_on_agent_offline',
    'check_and_block_ip',
    'check_and_update_circuit_breaker',
    'check_ai_circuit_breaker',
    'check_action_rate_limit',
    'check_execution_orphans',
    'check_expired_agent_keys',
    'check_expired_risks',
    'capture_forensic_snapshot_full',
    'audit_ai_action_changes',
    'audit_dlq_operations'
  ];
BEGIN
  FOREACH fn_name IN ARRAY internal_fns LOOP
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I() FROM authenticated, public, anon', fn_name);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
END $$;
