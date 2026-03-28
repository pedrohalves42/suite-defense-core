
-- ============================================================================
-- TASK AUTOMATION SYSTEM - ADR-024 Extension
-- Automacao inteligente para reduzir as 6.395+ tasks manuais
-- ============================================================================

-- 1. Funcao de auto-resolucao de tasks antigas
CREATE OR REPLACE FUNCTION public.auto_resolve_stale_tasks()
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
  v_result jsonb;
BEGIN
  -- 1. Auto-fechar tasks de JOB com severidade medium/low apos 14 dias
  UPDATE tasks SET
    status = 'ignored',
    closed_at = NOW(),
    closure_reason = 'Auto-closed: Job task with medium/low severity older than 14 days',
    closure_evidence = jsonb_build_object(
      'auto_closure', true,
      'rule', 'stale_job_task',
      'age_days', EXTRACT(EPOCH FROM (NOW() - created_at))/86400
    ),
    updated_at = NOW()
  WHERE source_type = 'job'
    AND severity IN ('medium', 'low', 'info')
    AND status IN ('open', 'in_progress')
    AND created_at < NOW() - INTERVAL '14 days'
    AND auto_generated = true;
  GET DIAGNOSTICS v_job_tasks_closed = ROW_COUNT;

  -- 2. Auto-fechar tasks de DLQ com severidade low apos 7 dias
  UPDATE tasks SET
    status = 'ignored',
    closed_at = NOW(),
    closure_reason = 'Auto-closed: DLQ task with low severity older than 7 days',
    closure_evidence = jsonb_build_object(
      'auto_closure', true,
      'rule', 'stale_dlq_task',
      'age_days', EXTRACT(EPOCH FROM (NOW() - created_at))/86400
    ),
    updated_at = NOW()
  WHERE source_type = 'dlq'
    AND severity IN ('low', 'info')
    AND status = 'open'
    AND created_at < NOW() - INTERVAL '7 days';
  GET DIAGNOSTICS v_dlq_tasks_closed = ROW_COUNT;

  -- 3. Auto-fechar tasks de system_alert com severity low/info apos 3 dias
  UPDATE tasks SET
    status = 'resolved',
    closed_at = NOW(),
    closure_reason = 'Auto-resolved: Low/info severity system alert older than 3 days',
    closure_evidence = jsonb_build_object(
      'auto_closure', true,
      'rule', 'low_severity_alert',
      'age_days', EXTRACT(EPOCH FROM (NOW() - created_at))/86400
    ),
    updated_at = NOW()
  WHERE source_type = 'system_alert'
    AND severity IN ('low', 'info')
    AND status = 'open'
    AND created_at < NOW() - INTERVAL '3 days';
  GET DIAGNOSTICS v_low_alerts_closed = ROW_COUNT;

  -- 4. Auto-triar insights de AI nao-criticos apos 21 dias
  UPDATE tasks SET
    status = 'accepted_risk',
    closed_at = NOW(),
    closure_reason = 'Auto-triaged: AI insight older than 21 days without action - risk accepted',
    closure_evidence = jsonb_build_object(
      'auto_closure', true,
      'rule', 'stale_ai_insight',
      'original_severity', severity,
      'age_days', EXTRACT(EPOCH FROM (NOW() - created_at))/86400
    ),
    updated_at = NOW()
  WHERE source_type = 'ai_insight'
    AND severity NOT IN ('critical') -- Nunca auto-fechar critical
    AND status IN ('open')
    AND created_at < NOW() - INTERVAL '21 days';
  GET DIAGNOSTICS v_old_insights_triaged = ROW_COUNT;

  v_result := jsonb_build_object(
    'success', true,
    'job_tasks_closed', v_job_tasks_closed,
    'dlq_tasks_closed', v_dlq_tasks_closed,
    'low_alerts_closed', v_low_alerts_closed,
    'insights_triaged', v_old_insights_triaged,
    'total_automated', v_job_tasks_closed + v_dlq_tasks_closed + v_low_alerts_closed + v_old_insights_triaged,
    'executed_at', NOW()
  );

  -- Reportar para cron_health_checks
  INSERT INTO cron_health_checks (cron_name, last_success_at, consecutive_failures, updated_at)
  VALUES ('auto-resolve-stale-tasks', NOW(), 0, NOW())
  ON CONFLICT (cron_name) DO UPDATE SET
    last_success_at = NOW(),
    consecutive_failures = 0,
    last_error = NULL,
    updated_at = NOW();

  -- Log no audit
  INSERT INTO audit_logs (action, entity_type, entity_id, changes, actor_type)
  VALUES ('auto_resolve_tasks', 'tasks', gen_random_uuid(), v_result, 'system');

  RETURN v_result;

EXCEPTION WHEN OTHERS THEN
  INSERT INTO cron_health_checks (cron_name, last_failure_at, last_error, consecutive_failures, updated_at)
  VALUES ('auto-resolve-stale-tasks', NOW(), SQLERRM, 1, NOW())
  ON CONFLICT (cron_name) DO UPDATE SET
    last_failure_at = NOW(),
    last_error = SQLERRM,
    consecutive_failures = cron_health_checks.consecutive_failures + 1,
    updated_at = NOW();
  RAISE;
END;
$$;

COMMENT ON FUNCTION auto_resolve_stale_tasks IS 
'ADR-024 Extension: Auto-resolve stale tasks based on severity and age rules.
Rules:
- Job tasks (medium/low): 14 days ? ignored
- DLQ tasks (low): 7 days ? ignored  
- System alerts (low/info): 3 days ? resolved
- AI insights (non-critical): 21 days ? accepted_risk
Critical tasks are NEVER auto-closed.';

-- 2. View para metricas de automacao
CREATE OR REPLACE VIEW v_task_automation_metrics WITH (security_invoker = on) AS
SELECT 
  tenant_id,
  DATE_TRUNC('day', closed_at) as closure_day,
  COUNT(*) FILTER (WHERE closure_reason LIKE 'Auto-%') as auto_closed,
  COUNT(*) FILTER (WHERE closure_reason NOT LIKE 'Auto-%' OR closure_reason IS NULL) as manual_closed,
  ROUND(
    COUNT(*) FILTER (WHERE closure_reason LIKE 'Auto-%')::numeric / 
    NULLIF(COUNT(*), 0) * 100, 1
  ) as automation_rate_percent
FROM tasks 
WHERE closed_at IS NOT NULL
  AND closed_at > NOW() - INTERVAL '30 days'
GROUP BY tenant_id, DATE_TRUNC('day', closed_at);

COMMENT ON VIEW v_task_automation_metrics IS 
'Task automation metrics per tenant. Shows auto-closed vs manual closed tasks.';

-- 3. View para tasks prioritarias (criticas nao atribuidas)
CREATE OR REPLACE VIEW v_critical_unassigned_tasks WITH (security_invoker = on) AS
SELECT 
  t.id,
  t.tenant_id,
  t.title,
  t.severity,
  t.source_type,
  t.status,
  t.created_at,
  EXTRACT(EPOCH FROM (NOW() - t.created_at))/3600 as age_hours,
  t.sla_breached_at IS NOT NULL as sla_breached,
  t.due_at
FROM tasks t
WHERE t.status IN ('open', 'in_progress')
  AND t.severity = 'critical'
  AND t.assigned_to IS NULL
  AND (t.tenant_id = get_active_tenant_id() OR is_current_super_admin())
ORDER BY t.created_at ASC;

COMMENT ON VIEW v_critical_unassigned_tasks IS 
'Critical tasks without assignment. For auto-assignment and escalation monitoring.';

-- 4. Inicializar registro no cron_health_checks
INSERT INTO cron_health_checks (cron_name, updated_at)
VALUES ('auto-resolve-stale-tasks', NOW())
ON CONFLICT (cron_name) DO NOTHING;
