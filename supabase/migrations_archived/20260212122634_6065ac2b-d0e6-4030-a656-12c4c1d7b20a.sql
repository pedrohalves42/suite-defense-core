
-- =====================================================
-- SSA-SEC-008: Blindar RPCs SECURITY DEFINER sem guard
-- Remediacao V-401: Adicionar validacao de autorizacao
-- =====================================================

-- =====================================================
-- CATEGORIA 1: Funcoes ADMINISTRATIVAS (requerem super_admin)
-- Estas funcoes tem impacto global cross-tenant
-- =====================================================

-- 1. apply_version_block - Bloqueia versoes para TODOS os tenants
CREATE OR REPLACE FUNCTION public.apply_version_block(
  p_version text, 
  p_platform text, 
  p_reason text DEFAULT 'Automated block due to high failure rate'::text, 
  p_blocked_by text DEFAULT 'rules_engine'::text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- SSA-SEC-008: Only super_admin or service_role can block versions globally
  IF NOT is_current_super_admin() THEN
    INSERT INTO security_logs (tenant_id, ip_address, endpoint, attack_type, severity, blocked, details)
    VALUES (get_active_tenant_id(), 'system', 'apply_version_block', 'privilege_escalation', 'high', true,
      jsonb_build_object('user_id', auth.uid(), 'attempted_version', p_version, 'platform', p_platform));
    RAISE EXCEPTION 'Only super_admin can block versions globally (SSA-SEC-008)';
  END IF;

  UPDATE public.agent_versions
  SET 
    is_blocked = true,
    blocked_at = NOW(),
    blocked_reason = p_reason,
    blocked_by = p_blocked_by
  WHERE version = p_version 
    AND platform = p_platform;
  
  RETURN FOUND;
END;
$function$;

-- 2. authorize_agent_recovery - Muda estado de agente
CREATE OR REPLACE FUNCTION public.authorize_agent_recovery(
  p_agent_id uuid, 
  p_approved_by uuid, 
  p_expires_in_minutes integer DEFAULT 10
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant_id UUID;
  v_caller_tenant UUID;
  v_mode TEXT;
  v_event_id UUID;
  v_auth_id UUID;
  v_payload JSONB;
BEGIN
  -- SSA-SEC-008: Validate caller has access to agent's tenant
  v_caller_tenant := get_active_tenant_id();
  
  SELECT tenant_id, agent_mode INTO v_tenant_id, v_mode FROM agents WHERE id = p_agent_id;
  IF v_tenant_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Agent not found'); END IF;
  
  -- Cross-tenant check
  IF v_tenant_id IS DISTINCT FROM v_caller_tenant AND NOT is_current_super_admin() THEN
    INSERT INTO security_logs (tenant_id, ip_address, endpoint, attack_type, severity, blocked, details)
    VALUES (v_caller_tenant, 'system', 'authorize_agent_recovery', 'cross_tenant_attempt', 'critical', true,
      jsonb_build_object('user_id', auth.uid(), 'agent_id', p_agent_id, 'agent_tenant', v_tenant_id, 'caller_tenant', v_caller_tenant));
    RETURN jsonb_build_object('success', false, 'error', 'TENANT_MISMATCH');
  END IF;
  
  IF v_mode != 'SAFE_MODE' THEN RETURN jsonb_build_object('success', false, 'error', 'Not in SAFE_MODE'); END IF;
  
  SELECT id INTO v_event_id FROM agent_safe_mode_events
  WHERE agent_id = p_agent_id AND resolved_at IS NULL ORDER BY created_at DESC LIMIT 1;
  
  v_payload := jsonb_build_object(
    'agent_id', p_agent_id,
    'transition', 'SAFE_MODE ? RECOVERY',
    'issued_at', NOW(),
    'expires_at', NOW() + (p_expires_in_minutes || ' minutes')::INTERVAL,
    'approved_by', p_approved_by
  );
  
  INSERT INTO agent_recovery_authorizations (
    agent_id, tenant_id, safe_mode_event_id, requested_by, approved_by,
    signed_payload, status, expires_at
  ) VALUES (
    p_agent_id, v_tenant_id, v_event_id, p_approved_by, p_approved_by,
    v_payload, 'approved', NOW() + (p_expires_in_minutes || ' minutes')::INTERVAL
  ) RETURNING id INTO v_auth_id;
  
  UPDATE agents SET agent_mode = 'RECOVERY' WHERE id = p_agent_id;
  
  RETURN jsonb_build_object('success', true, 'authorization_id', v_auth_id, 'signed_payload', v_payload);
END;
$function$;

-- 3. backfill_audit_log_hashes - Operacao administrativa sensivel
CREATE OR REPLACE FUNCTION public.backfill_audit_log_hashes(p_tenant_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(updated_count integer, tenant_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_log RECORD;
  v_previous_hash TEXT := 'GENESIS';
  v_count INTEGER := 0;
  v_current_tenant UUID;
BEGIN
  -- SSA-SEC-008: Only super_admin can backfill audit hashes
  IF NOT is_current_super_admin() THEN
    RAISE EXCEPTION 'Only super_admin can backfill audit log hashes (SSA-SEC-008)';
  END IF;

  FOR v_current_tenant IN 
    SELECT DISTINCT al.tenant_id 
    FROM audit_logs al 
    WHERE (p_tenant_id IS NULL OR al.tenant_id = p_tenant_id)
    ORDER BY al.tenant_id
  LOOP
    v_previous_hash := 'GENESIS';
    
    FOR v_log IN 
      SELECT al.id, al.created_at, al.user_id, al.action, al.resource_type, al.resource_id, al.success
      FROM audit_logs al
      WHERE al.tenant_id = v_current_tenant
      ORDER BY al.created_at ASC, al.id ASC
    LOOP
      UPDATE audit_logs
      SET 
        integrity_hash = encode(sha256(convert_to(
          COALESCE(v_log.id::text, '') || 
          COALESCE(v_log.created_at::text, '') || 
          COALESCE(v_log.user_id::text, '') || 
          COALESCE(v_log.action, '') || 
          COALESCE(v_log.resource_type, '') || 
          COALESCE(v_log.resource_id, '') || 
          v_log.success::text || 
          v_previous_hash,
          'UTF8'
        )), 'hex'),
        previous_log_hash = v_previous_hash
      WHERE id = v_log.id
      RETURNING integrity_hash INTO v_previous_hash;
      
      v_count := v_count + 1;
    END LOOP;
    
    updated_count := v_count;
    tenant_id := v_current_tenant;
    RETURN NEXT;
    v_count := 0;
  END LOOP;
  
  RETURN;
END;
$function$;

-- =====================================================
-- CATEGORIA 2: Funcoes de CRON/manutencao
-- Restringir para que apenas service_role possa chamar
-- Qualquer authenticated user que tente chamar recebe erro
-- =====================================================

-- Helper: Verifica se chamador e service_role (via current_setting)
CREATE OR REPLACE FUNCTION public._assert_service_role_or_super_admin()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- service_role bypasses RLS, so if RLS is active, caller is not service_role
  -- We check via is_current_super_admin as alternative for admin RPCs
  -- For cron functions, they MUST be called via service_role (Edge Functions)
  IF current_setting('role', true) = 'authenticated' AND NOT is_current_super_admin() THEN
    RAISE EXCEPTION 'This function can only be called by service_role or super_admin (SSA-SEC-008)';
  END IF;
END;
$$;

-- 4. aggregate_daily_metrics
CREATE OR REPLACE FUNCTION public.aggregate_daily_metrics(p_date date DEFAULT (CURRENT_DATE - 1))
RETURNS TABLE(agents_processed bigint, rows_inserted bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_agents BIGINT := 0;
  v_inserted BIGINT := 0;
BEGIN
  PERFORM _assert_service_role_or_super_admin(); -- SSA-SEC-008

  INSERT INTO public.agent_metrics_daily (
    tenant_id, agent_id, metric_date,
    avg_cpu_percent, max_cpu_percent, min_cpu_percent,
    avg_memory_percent, max_memory_percent, min_memory_percent,
    avg_disk_percent, max_disk_percent,
    sample_count, max_uptime_seconds
  )
  SELECT 
    m.tenant_id, m.agent_id, p_date,
    ROUND(AVG(m.cpu_usage_percent), 2), MAX(m.cpu_usage_percent), MIN(m.cpu_usage_percent),
    ROUND(AVG(m.memory_usage_percent), 2), MAX(m.memory_usage_percent), MIN(m.memory_usage_percent),
    ROUND(AVG(m.disk_usage_percent), 2), MAX(m.disk_usage_percent),
    COUNT(*)::INTEGER, MAX(m.uptime_seconds)
  FROM public.agent_system_metrics_partitioned m
  WHERE m.collected_at >= p_date::timestamp with time zone
    AND m.collected_at < (p_date + 1)::timestamp with time zone
  GROUP BY m.tenant_id, m.agent_id
  ON CONFLICT (agent_id, metric_date) DO UPDATE SET
    avg_cpu_percent = EXCLUDED.avg_cpu_percent, max_cpu_percent = EXCLUDED.max_cpu_percent,
    min_cpu_percent = EXCLUDED.min_cpu_percent, avg_memory_percent = EXCLUDED.avg_memory_percent,
    max_memory_percent = EXCLUDED.max_memory_percent, min_memory_percent = EXCLUDED.min_memory_percent,
    avg_disk_percent = EXCLUDED.avg_disk_percent, max_disk_percent = EXCLUDED.max_disk_percent,
    sample_count = EXCLUDED.sample_count, max_uptime_seconds = EXCLUDED.max_uptime_seconds;
  
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  SELECT COUNT(DISTINCT agent_id) INTO v_agents
  FROM public.agent_system_metrics_partitioned
  WHERE collected_at >= p_date::timestamp with time zone
    AND collected_at < (p_date + 1)::timestamp with time zone;
  
  agents_processed := v_agents;
  rows_inserted := v_inserted;
  RETURN NEXT;
END;
$function$;

-- 5. archive_old_evidence_logs
CREATE OR REPLACE FUNCTION public.archive_old_evidence_logs(retention_days integer DEFAULT 90)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  archived_count INTEGER;
BEGIN
  PERFORM _assert_service_role_or_super_admin(); -- SSA-SEC-008

  DELETE FROM agent_evidence_logs 
  WHERE created_at < NOW() - (retention_days || ' days')::INTERVAL;
  
  GET DIAGNOSTICS archived_count = ROW_COUNT;
  RETURN archived_count;
END;
$function$;

-- 6. auto_acknowledge_old_insights
CREATE OR REPLACE FUNCTION public.auto_acknowledge_old_insights()
RETURNS TABLE(acknowledged_count integer, insight_ids uuid[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count INTEGER;
  v_ids UUID[];
BEGIN
  PERFORM _assert_service_role_or_super_admin(); -- SSA-SEC-008

  WITH updated AS (
    UPDATE public.ai_insights
    SET acknowledged = true, acknowledged_at = NOW()
    WHERE acknowledged = false AND severity = 'info'
      AND created_at < NOW() - INTERVAL '30 days'
    RETURNING id
  )
  SELECT COUNT(*)::INTEGER, ARRAY_AGG(id)
  INTO v_count, v_ids FROM updated;
  
  IF v_count > 0 THEN RAISE NOTICE 'Auto-acknowledged % old info insights', v_count; END IF;
  RETURN QUERY SELECT v_count, COALESCE(v_ids, ARRAY[]::UUID[]);
END;
$function$;

-- 7. auto_cancel_zombie_jobs
CREATE OR REPLACE FUNCTION public.auto_cancel_zombie_jobs()
RETURNS TABLE(cancelled_count integer, job_ids uuid[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_cancelled_count INTEGER;
  v_job_ids UUID[];
BEGIN
  PERFORM _assert_service_role_or_super_admin(); -- SSA-SEC-008

  WITH cancelled_jobs AS (
    UPDATE jobs
    SET status = 'failed',
        error_message = 'Auto-cancelled: Job stuck in delivered state for >2 hours (Zombie TTL)',
        completed_at = NOW()
    WHERE status = 'delivered'
      AND delivered_at < NOW() - INTERVAL '2 hours'
    RETURNING id, agent_name, tenant_id
  ),
  logged AS (
    INSERT INTO security_logs (tenant_id, ip_address, endpoint, attack_type, severity, blocked, details)
    SELECT tenant_id, 'system', 'zombie_job_cleanup', 'zombie_job_ttl', 'medium', false,
      jsonb_build_object('job_id', id, 'agent_name', agent_name, 'action', 'auto_cancelled', 'ttl_hours', 2)
    FROM cancelled_jobs
    RETURNING 1
  )
  SELECT COUNT(*)::INTEGER, ARRAY_AGG(id)
  INTO v_cancelled_count, v_job_ids FROM cancelled_jobs;
  
  IF v_cancelled_count > 0 THEN
    RAISE NOTICE '[SSA-003] Zombie Job TTL: % jobs cancelled', v_cancelled_count;
  END IF;
  
  RETURN QUERY SELECT COALESCE(v_cancelled_count, 0), COALESCE(v_job_ids, ARRAY[]::UUID[]);
END;
$function$;

-- 8. auto_resolve_stale_tasks (ja tem logica complexa, apenas adicionar guard)
CREATE OR REPLACE FUNCTION public.auto_resolve_stale_tasks()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_job_tasks_closed INTEGER := 0;
  v_dlq_tasks_closed INTEGER := 0;
  v_low_alerts_closed INTEGER := 0;
  v_old_insights_triaged INTEGER := 0;
  v_result jsonb;
BEGIN
  PERFORM _assert_service_role_or_super_admin(); -- SSA-SEC-008

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

  UPDATE tasks SET
    status = 'ignored', closed_at = NOW(),
    closure_reason = 'Auto-closed: DLQ task with low severity older than 7 days',
    closure_evidence = jsonb_build_object('auto_closure', true, 'rule', 'stale_dlq_task',
      'age_days', EXTRACT(EPOCH FROM (NOW() - created_at))/86400),
    updated_at = NOW()
  WHERE source_type = 'dlq' AND severity IN ('low', 'info')
    AND status = 'open' AND created_at < NOW() - INTERVAL '7 days';
  GET DIAGNOSTICS v_dlq_tasks_closed = ROW_COUNT;

  UPDATE tasks SET
    status = 'resolved', closed_at = NOW(),
    closure_reason = 'Auto-resolved: Low/info severity system alert older than 3 days',
    closure_evidence = jsonb_build_object('auto_closure', true, 'rule', 'low_severity_alert',
      'age_days', EXTRACT(EPOCH FROM (NOW() - created_at))/86400),
    updated_at = NOW()
  WHERE source_type = 'system_alert' AND severity IN ('low', 'info')
    AND status = 'open' AND created_at < NOW() - INTERVAL '3 days';
  GET DIAGNOSTICS v_low_alerts_closed = ROW_COUNT;

  UPDATE tasks SET
    status = 'accepted_risk', closed_at = NOW(),
    closure_reason = 'Auto-triaged: AI insight older than 21 days without action - risk accepted',
    closure_evidence = jsonb_build_object('auto_closure', true, 'rule', 'stale_ai_insight',
      'original_severity', severity, 'age_days', EXTRACT(EPOCH FROM (NOW() - created_at))/86400),
    updated_at = NOW()
  WHERE source_type = 'ai_insight' AND severity NOT IN ('critical')
    AND status IN ('open') AND created_at < NOW() - INTERVAL '21 days';
  GET DIAGNOSTICS v_old_insights_triaged = ROW_COUNT;

  v_result := jsonb_build_object(
    'success', true, 'job_tasks_closed', v_job_tasks_closed,
    'dlq_tasks_closed', v_dlq_tasks_closed, 'low_alerts_closed', v_low_alerts_closed,
    'insights_triaged', v_old_insights_triaged,
    'total_automated', v_job_tasks_closed + v_dlq_tasks_closed + v_low_alerts_closed + v_old_insights_triaged,
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
$function$;

-- 9-16. Cleanup functions - all get the guard
CREATE OR REPLACE FUNCTION public.cleanup_expired_keys()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_count INTEGER;
BEGIN
  PERFORM _assert_service_role_or_super_admin();
  SELECT COUNT(*) INTO v_count FROM public.enrollment_keys WHERE expires_at < now() AND is_active = true;
  UPDATE public.enrollment_keys SET is_active = false, updated_at = now() WHERE expires_at < now() AND is_active = true;
  IF v_count > 0 THEN
    INSERT INTO public.audit_logs (tenant_id, user_id, action, resource_type, details, success)
    VALUES (NULL, NULL, 'cleanup_expired_keys', 'enrollment_keys',
      jsonb_build_object('deactivated_count', v_count, 'executed_at', now()::text, 'operation', 'scheduled_cleanup'), true);
  END IF;
  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cleanup_expired_sessions()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _count INTEGER;
BEGIN
  PERFORM _assert_service_role_or_super_admin();
  DELETE FROM active_sessions WHERE expires_at < now();
  GET DIAGNOSTICS _count = ROW_COUNT;
  RETURN _count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cleanup_old_data()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM _assert_service_role_or_super_admin();
  DELETE FROM public.rate_limits WHERE window_start < NOW() - INTERVAL '30 minutes';
  DELETE FROM public.hmac_signatures WHERE used_at < NOW() - INTERVAL '5 minutes';
  DELETE FROM public.failed_login_attempts WHERE created_at < NOW() - INTERVAL '24 hours';
  DELETE FROM public.ip_blocklist WHERE blocked_until < NOW();
  DELETE FROM public.agent_system_metrics WHERE collected_at < NOW() - INTERVAL '30 days';
  DELETE FROM public.security_logs WHERE created_at < NOW() - INTERVAL '90 days';
END;
$function$;

CREATE OR REPLACE FUNCTION public.cleanup_old_failed_attempts()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM _assert_service_role_or_super_admin();
  DELETE FROM public.failed_login_attempts WHERE created_at < now() - interval '24 hours';
  DELETE FROM public.ip_blocklist WHERE blocked_until < now();
END;
$function$;

CREATE OR REPLACE FUNCTION public.cleanup_old_hmac_signatures()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE deleted_count integer;
BEGIN
  PERFORM _assert_service_role_or_super_admin();
  DELETE FROM public.hmac_signatures WHERE used_at < NOW() - INTERVAL '7 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cleanup_old_metrics()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM _assert_service_role_or_super_admin();
  DELETE FROM agent_system_metrics WHERE collected_at < NOW() - INTERVAL '30 days';
END;
$function$;

CREATE OR REPLACE FUNCTION public.cleanup_old_performance_metrics()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM _assert_service_role_or_super_admin();
  DELETE FROM public.performance_metrics WHERE created_at < NOW() - INTERVAL '90 days';
END;
$function$;

CREATE OR REPLACE FUNCTION public.cleanup_old_rate_limits()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM _assert_service_role_or_super_admin();
  DELETE FROM public.rate_limits WHERE window_start < now() - INTERVAL '30 minutes';
END;
$function$;

-- 17. cleanup_old_disk_metrics
CREATE OR REPLACE FUNCTION public.cleanup_old_disk_metrics(retention_days integer DEFAULT 90)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE deleted_count bigint;
BEGIN
  PERFORM _assert_service_role_or_super_admin();
  DELETE FROM agent_disk_metrics WHERE collected_at < NOW() - (retention_days || ' days')::interval;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$function$;

-- 18. cleanup_jobs_for_offline_agents
CREATE OR REPLACE FUNCTION public.cleanup_jobs_for_offline_agents()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  cancelled_count integer := 0;
  result jsonb;
BEGIN
  PERFORM _assert_service_role_or_super_admin();
  
  UPDATE jobs SET status = 'cancelled', completed_at = NOW(),
    error_message = '[AUTO-CLEANUP] Job cancelled: Agent offline >2h', failure_class = 'AGENT_OFFLINE'
  WHERE status IN ('pending', 'queued')
    AND agent_id IN (SELECT id FROM agents WHERE status = 'inactive' OR last_heartbeat < NOW() - INTERVAL '2 hours')
    AND created_at < NOW() - INTERVAL '30 minutes';
  GET DIAGNOSTICS cancelled_count = ROW_COUNT;
  
  result := jsonb_build_object('success', true, 'jobs_cancelled', cancelled_count, 'executed_at', NOW());
  
  INSERT INTO cron_health_checks (cron_name, last_success_at, consecutive_failures, updated_at, last_result)
  VALUES ('cleanup-jobs-offline-agents', NOW(), 0, NOW(), result)
  ON CONFLICT (cron_name) DO UPDATE SET
    last_success_at = NOW(), consecutive_failures = 0, last_error = NULL,
    updated_at = NOW(), last_result = EXCLUDED.last_result;
  
  RETURN result;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO cron_health_checks (cron_name, last_failure_at, last_error, consecutive_failures, updated_at)
  VALUES ('cleanup-jobs-offline-agents', NOW(), SQLERRM, 1, NOW())
  ON CONFLICT (cron_name) DO UPDATE SET
    last_failure_at = NOW(), last_error = SQLERRM,
    consecutive_failures = cron_health_checks.consecutive_failures + 1, updated_at = NOW();
  RAISE;
END;
$function$;

-- 19. cleanup_offline_agents_jobs
CREATE OR REPLACE FUNCTION public.cleanup_offline_agents_jobs()
RETURNS TABLE(cleaned_count integer, agent_ids uuid[], job_ids uuid[])
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_cleaned_count INTEGER; v_agent_ids UUID[]; v_job_ids UUID[];
BEGIN
  PERFORM _assert_service_role_or_super_admin();
  
  WITH offline_agents AS (
    SELECT id FROM public.agents
    WHERE last_heartbeat IS NULL OR last_heartbeat < NOW() - INTERVAL '24 hours'
  ),
  cancelled_jobs AS (
    UPDATE public.jobs SET status = 'cancelled',
      error_message = 'Auto-cancelled: agent offline >24h (scheduled cleanup)', completed_at = NOW()
    WHERE status IN ('queued', 'delivered')
      AND agent_id IN (SELECT id FROM offline_agents)
    RETURNING id, agent_id
  )
  SELECT COUNT(*)::INTEGER, ARRAY_AGG(DISTINCT agent_id), ARRAY_AGG(id)
  INTO v_cleaned_count, v_agent_ids, v_job_ids FROM cancelled_jobs;
  
  RETURN QUERY SELECT COALESCE(v_cleaned_count, 0), COALESCE(v_agent_ids, ARRAY[]::UUID[]), COALESCE(v_job_ids, ARRAY[]::UUID[]);
END;
$function$;

-- 20. calculate_incident_burn_rate - Operacao de SLO
CREATE OR REPLACE FUNCTION public.calculate_incident_burn_rate(p_fingerprint_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_fp RECORD; v_occ_1h integer; v_occ_6h integer; v_occ_24h integer;
  v_expected_1h numeric; v_burn_1h numeric; v_burn_6h numeric; v_burn_24h numeric;
  v_slo_target numeric; v_error_budget numeric; v_budget_consumed numeric; v_status text;
BEGIN
  PERFORM _assert_service_role_or_super_admin(); -- SSA-SEC-008
  
  SELECT * INTO v_fp FROM failure_fingerprints WHERE id = p_fingerprint_id;
  IF NOT FOUND THEN RETURN; END IF;
  
  SELECT COUNT(*) INTO v_occ_1h FROM failure_occurrences
  WHERE fingerprint_id = p_fingerprint_id AND occurred_at > now() - interval '1 hour';
  SELECT COUNT(*) INTO v_occ_6h FROM failure_occurrences
  WHERE fingerprint_id = p_fingerprint_id AND occurred_at > now() - interval '6 hours';
  SELECT COUNT(*) INTO v_occ_24h FROM failure_occurrences
  WHERE fingerprint_id = p_fingerprint_id AND occurred_at > now() - interval '24 hours';
  
  v_slo_target := get_slo_target_for_severity(v_fp.severity_hint);
  v_error_budget := (100 - v_slo_target) / 100;
  v_expected_1h := GREATEST(v_fp.total_occurrences::numeric / GREATEST(EXTRACT(EPOCH FROM now() - v_fp.first_seen_at) / 3600, 1), 0.1);
  
  v_burn_1h := CASE WHEN v_expected_1h * v_error_budget > 0 THEN v_occ_1h / (v_expected_1h * v_error_budget) ELSE 0 END;
  v_burn_6h := CASE WHEN v_expected_1h * 6 * v_error_budget > 0 THEN v_occ_6h / (v_expected_1h * 6 * v_error_budget) ELSE 0 END;
  v_burn_24h := CASE WHEN v_expected_1h * 24 * v_error_budget > 0 THEN v_occ_24h / (v_expected_1h * 24 * v_error_budget) ELSE 0 END;
  v_budget_consumed := LEAST(v_burn_24h * 100, 100);
  
  v_status := CASE
    WHEN v_burn_1h >= 5 AND v_burn_6h >= 2 THEN 'critical'
    WHEN v_burn_1h >= 4 OR v_burn_6h >= 2 THEN 'high'
    WHEN v_burn_1h >= 2 OR v_burn_6h >= 1.5 THEN 'warning'
    WHEN v_burn_1h >= 1 THEN 'alert'
    ELSE 'ok'
  END;
  
  INSERT INTO incident_slo_state (
    fingerprint_id, slo_target, error_budget,
    burn_rate_1h, burn_rate_6h, burn_rate_24h,
    occurrences_1h, occurrences_6h, occurrences_24h,
    expected_rate_1h, budget_consumed, budget_remaining,
    status, last_evaluated_at, updated_at
  ) VALUES (
    p_fingerprint_id, v_slo_target, v_error_budget,
    v_burn_1h, v_burn_6h, v_burn_24h,
    v_occ_1h, v_occ_6h, v_occ_24h,
    v_expected_1h, v_budget_consumed, 100 - v_budget_consumed,
    v_status, now(), now()
  )
  ON CONFLICT (fingerprint_id) DO UPDATE SET
    slo_target = EXCLUDED.slo_target, error_budget = EXCLUDED.error_budget,
    burn_rate_1h = EXCLUDED.burn_rate_1h, burn_rate_6h = EXCLUDED.burn_rate_6h,
    burn_rate_24h = EXCLUDED.burn_rate_24h, occurrences_1h = EXCLUDED.occurrences_1h,
    occurrences_6h = EXCLUDED.occurrences_6h, occurrences_24h = EXCLUDED.occurrences_24h,
    expected_rate_1h = EXCLUDED.expected_rate_1h, budget_consumed = EXCLUDED.budget_consumed,
    budget_remaining = EXCLUDED.budget_remaining, status = EXCLUDED.status,
    last_evaluated_at = EXCLUDED.last_evaluated_at, updated_at = EXCLUDED.updated_at;
END;
$function$;

-- Add documentation comments
COMMENT ON FUNCTION public._assert_service_role_or_super_admin() IS 'SSA-SEC-008: Guard function to restrict cron/maintenance RPCs to service_role or super_admin only';
COMMENT ON FUNCTION public.apply_version_block(text, text, text, text) IS 'SSA-SEC-008: Requires super_admin. Blocks agent version globally across all tenants.';
COMMENT ON FUNCTION public.authorize_agent_recovery(uuid, uuid, integer) IS 'SSA-SEC-008: Requires tenant match or super_admin. Cross-tenant attempts logged to security_logs.';
COMMENT ON FUNCTION public.backfill_audit_log_hashes(uuid) IS 'SSA-SEC-008: Requires super_admin. Recalculates audit log integrity chain.';
