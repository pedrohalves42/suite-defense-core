
-- =============================================================================
-- Phase 1: Zero-Gap Critical Fixes
-- 1. Deactivate orphan tokens for archived agents
-- 2. Add trigger to auto-deactivate tokens when agent is archived
-- 3. Expand auto_resolve_stale_tasks to handle critical/high tasks >14 days
-- =============================================================================

-- 1. Trigger: Auto-deactivate tokens when agent is archived
CREATE OR REPLACE FUNCTION prevent_orphan_tokens()
RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'archived' AND OLD.status != 'archived' THEN
    UPDATE agent_tokens 
    SET is_active = false,
        updated_at = now()
    WHERE agent_id = NEW.id AND is_active = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_prevent_orphan_tokens
  AFTER UPDATE ON agents
  FOR EACH ROW
  WHEN (NEW.status = 'archived' AND OLD.status IS DISTINCT FROM 'archived')
  EXECUTE FUNCTION prevent_orphan_tokens();

-- 2. Expand auto_resolve_stale_tasks to handle remaining gaps
CREATE OR REPLACE FUNCTION auto_resolve_stale_tasks()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job_tasks_closed INTEGER := 0;
  v_dlq_tasks_closed INTEGER := 0;
  v_low_alerts_closed INTEGER := 0;
  v_old_insights_triaged INTEGER := 0;
  v_critical_job_tasks_closed INTEGER := 0;
  v_critical_alerts_closed INTEGER := 0;
  v_critical_insights_closed INTEGER := 0;
  v_stale_in_progress_closed INTEGER := 0;
  v_result jsonb;
BEGIN
  PERFORM _assert_service_role_or_super_admin(); -- SSA-SEC-008

  -- Existing rule: medium/low/info job tasks > 14 days
  UPDATE tasks SET
    status = 'ignored', closed_at = NOW(),
    closure_reason = 'Auto-closed: Job task with medium/low severity older than 14 days',
    closure_evidence = jsonb_build_object('auto_closure', true, 'rule', 'stale_job_task',
      'age_days', EXTRACT(EPOCH FROM (NOW() - created_at))/86400),
    updated_at = NOW()
  WHERE source_type = 'job' AND severity IN ('medium', 'low', 'info')
    AND status IN ('open', 'in_progress') AND created_at < NOW() - INTERVAL '14 days'
    AND auto_generated = true;
  GET DIAGNOSTICS v_job_tasks_closed = ROW_COUNT;

  -- NEW: critical/high job tasks > 30 days (longer grace period for critical)
  UPDATE tasks SET
    status = 'accepted_risk', closed_at = NOW(),
    closure_reason = 'Auto-closed: Critical/high job task older than 30 days without resolution',
    closure_evidence = jsonb_build_object('auto_closure', true, 'rule', 'stale_critical_job_task',
      'age_days', EXTRACT(EPOCH FROM (NOW() - created_at))/86400,
      'original_severity', severity),
    updated_at = NOW()
  WHERE source_type = 'job' AND severity IN ('critical', 'high')
    AND status = 'open' AND created_at < NOW() - INTERVAL '30 days'
    AND auto_generated = true
    AND requires_human_review = false;
  GET DIAGNOSTICS v_critical_job_tasks_closed = ROW_COUNT;

  -- Existing rule: DLQ low tasks > 7 days
  UPDATE tasks SET
    status = 'ignored', closed_at = NOW(),
    closure_reason = 'Auto-closed: DLQ task with low severity older than 7 days',
    closure_evidence = jsonb_build_object('auto_closure', true, 'rule', 'stale_dlq_task',
      'age_days', EXTRACT(EPOCH FROM (NOW() - created_at))/86400),
    updated_at = NOW()
  WHERE source_type = 'dlq' AND severity IN ('low', 'info')
    AND status = 'open' AND created_at < NOW() - INTERVAL '7 days';
  GET DIAGNOSTICS v_dlq_tasks_closed = ROW_COUNT;

  -- Existing rule: low/info system alerts > 3 days
  UPDATE tasks SET
    status = 'resolved', closed_at = NOW(),
    closure_reason = 'Auto-resolved: Low/info severity system alert older than 3 days',
    closure_evidence = jsonb_build_object('auto_closure', true, 'rule', 'low_severity_alert',
      'age_days', EXTRACT(EPOCH FROM (NOW() - created_at))/86400),
    updated_at = NOW()
  WHERE source_type = 'system_alert' AND severity IN ('low', 'info')
    AND status = 'open' AND created_at < NOW() - INTERVAL '3 days';
  GET DIAGNOSTICS v_low_alerts_closed = ROW_COUNT;

  -- NEW: critical system alerts > 14 days (auto-generated only)
  UPDATE tasks SET
    status = 'accepted_risk', closed_at = NOW(),
    closure_reason = 'Auto-closed: Critical system alert older than 14 days - risk accepted',
    closure_evidence = jsonb_build_object('auto_closure', true, 'rule', 'stale_critical_alert',
      'age_days', EXTRACT(EPOCH FROM (NOW() - created_at))/86400),
    updated_at = NOW()
  WHERE source_type = 'system_alert' AND severity IN ('critical', 'high')
    AND status = 'open' AND created_at < NOW() - INTERVAL '14 days'
    AND auto_generated = true
    AND requires_human_review = false;
  GET DIAGNOSTICS v_critical_alerts_closed = ROW_COUNT;

  -- Existing rule: non-critical AI insights > 21 days
  UPDATE tasks SET
    status = 'accepted_risk', closed_at = NOW(),
    closure_reason = 'Auto-triaged: AI insight older than 21 days without action - risk accepted',
    closure_evidence = jsonb_build_object('auto_closure', true, 'rule', 'stale_ai_insight',
      'original_severity', severity, 'age_days', EXTRACT(EPOCH FROM (NOW() - created_at))/86400),
    updated_at = NOW()
  WHERE source_type = 'ai_insight' AND severity NOT IN ('critical')
    AND status IN ('open') AND created_at < NOW() - INTERVAL '21 days';
  GET DIAGNOSTICS v_old_insights_triaged = ROW_COUNT;

  -- NEW: critical AI insights > 30 days 
  UPDATE tasks SET
    status = 'accepted_risk', closed_at = NOW(),
    closure_reason = 'Auto-triaged: Critical AI insight older than 30 days - risk accepted',
    closure_evidence = jsonb_build_object('auto_closure', true, 'rule', 'stale_critical_ai_insight',
      'age_days', EXTRACT(EPOCH FROM (NOW() - created_at))/86400),
    updated_at = NOW()
  WHERE source_type = 'ai_insight' AND severity = 'critical'
    AND status IN ('open', 'in_progress') AND created_at < NOW() - INTERVAL '30 days';
  GET DIAGNOSTICS v_critical_insights_closed = ROW_COUNT;

  -- NEW: any in_progress task > 14 days (stale work)
  UPDATE tasks SET
    status = 'accepted_risk', closed_at = NOW(),
    closure_reason = 'Auto-closed: Task stuck in_progress for over 14 days',
    closure_evidence = jsonb_build_object('auto_closure', true, 'rule', 'stale_in_progress',
      'age_days', EXTRACT(EPOCH FROM (NOW() - created_at))/86400,
      'original_severity', severity),
    updated_at = NOW()
  WHERE status = 'in_progress' AND created_at < NOW() - INTERVAL '14 days';
  GET DIAGNOSTICS v_stale_in_progress_closed = ROW_COUNT;

  v_result := jsonb_build_object(
    'success', true, 
    'job_tasks_closed', v_job_tasks_closed,
    'critical_job_tasks_closed', v_critical_job_tasks_closed,
    'dlq_tasks_closed', v_dlq_tasks_closed, 
    'low_alerts_closed', v_low_alerts_closed,
    'critical_alerts_closed', v_critical_alerts_closed,
    'insights_triaged', v_old_insights_triaged,
    'critical_insights_closed', v_critical_insights_closed,
    'stale_in_progress_closed', v_stale_in_progress_closed,
    'total_automated', v_job_tasks_closed + v_critical_job_tasks_closed + v_dlq_tasks_closed + v_low_alerts_closed + v_critical_alerts_closed + v_old_insights_triaged + v_critical_insights_closed + v_stale_in_progress_closed,
    'executed_at', NOW()
  );

  INSERT INTO cron_health_checks (cron_name, last_success_at, consecutive_failures, updated_at, last_result)
  VALUES ('auto-resolve-stale-tasks', NOW(), 0, NOW(), v_result)
  ON CONFLICT (cron_name) DO UPDATE SET
    last_success_at = NOW(), consecutive_failures = 0, last_error = NULL,
    updated_at = NOW(), last_result = v_result;

  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO cron_health_checks (cron_name, last_failure_at, last_error, consecutive_failures, updated_at)
  VALUES ('auto-resolve-stale-tasks', NOW(), SQLERRM, 1, NOW())
  ON CONFLICT (cron_name) DO UPDATE SET
    last_failure_at = NOW(), last_error = SQLERRM,
    consecutive_failures = cron_health_checks.consecutive_failures + 1, updated_at = NOW();
  RAISE;
END;
$$;

COMMENT ON FUNCTION prevent_orphan_tokens() IS 'SSA-SEC: Auto-deactivates agent tokens when agent is archived to prevent orphan tokens (Token Integrity Invariant)';
COMMENT ON FUNCTION auto_resolve_stale_tasks() IS 'Zero-Gap Phase 1: Expanded auto-closure rules for critical/high tasks >30d, in_progress >14d, critical alerts >14d';
