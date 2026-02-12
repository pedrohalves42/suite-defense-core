
-- =============================================================================
-- Zero-Gap Remediation: P0 → P2 Fixes
-- =============================================================================

-- =========================================
-- P0-G03: Fix security_logs append-only violation
-- Root cause: UPDATE policy exists on append-only table
-- =========================================
DROP POLICY IF EXISTS "security_logs_update_active_tenant_v206" ON public.security_logs;

-- =========================================
-- P1-G04: Fix task auto-resolution bugs
-- Bug 1: critical system_alert tasks have requires_human_review=true,
--         blocking auto-close rule (which requires requires_human_review=false)
-- Fix: Add rule for auto_generated tasks that have requires_human_review=true 
--      after 30 days (extended grace period)
-- Bug 2: in_progress tasks >14 days not being closed
-- =========================================
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
  v_critical_job_tasks_closed INTEGER := 0;
  v_critical_alerts_closed INTEGER := 0;
  v_critical_insights_closed INTEGER := 0;
  v_stale_in_progress_closed INTEGER := 0;
  v_human_review_alerts_closed INTEGER := 0;
  v_result jsonb;
BEGIN
  PERFORM _assert_service_role_or_super_admin();

  -- Rule 1: medium/low/info job tasks > 14 days
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

  -- Rule 2: critical/high job tasks > 30 days
  UPDATE tasks SET
    status = 'accepted_risk', closed_at = NOW(),
    closure_reason = 'Auto-closed: Critical/high job task older than 30 days without resolution',
    closure_evidence = jsonb_build_object('auto_closure', true, 'rule', 'stale_critical_job_task',
      'age_days', EXTRACT(EPOCH FROM (NOW() - created_at))/86400,
      'original_severity', severity),
    updated_at = NOW()
  WHERE source_type = 'job' AND severity IN ('critical', 'high')
    AND status = 'open' AND created_at < NOW() - INTERVAL '30 days'
    AND auto_generated = true;
  GET DIAGNOSTICS v_critical_job_tasks_closed = ROW_COUNT;

  -- Rule 3: DLQ low tasks > 7 days
  UPDATE tasks SET
    status = 'ignored', closed_at = NOW(),
    closure_reason = 'Auto-closed: DLQ task with low severity older than 7 days',
    closure_evidence = jsonb_build_object('auto_closure', true, 'rule', 'stale_dlq_task',
      'age_days', EXTRACT(EPOCH FROM (NOW() - created_at))/86400),
    updated_at = NOW()
  WHERE source_type = 'dlq' AND severity IN ('low', 'info')
    AND status = 'open' AND created_at < NOW() - INTERVAL '7 days';
  GET DIAGNOSTICS v_dlq_tasks_closed = ROW_COUNT;

  -- Rule 4: low/info system alerts > 3 days
  UPDATE tasks SET
    status = 'resolved', closed_at = NOW(),
    closure_reason = 'Auto-resolved: Low/info severity system alert older than 3 days',
    closure_evidence = jsonb_build_object('auto_closure', true, 'rule', 'low_severity_alert',
      'age_days', EXTRACT(EPOCH FROM (NOW() - created_at))/86400),
    updated_at = NOW()
  WHERE source_type = 'system_alert' AND severity IN ('low', 'info')
    AND status = 'open' AND created_at < NOW() - INTERVAL '3 days';
  GET DIAGNOSTICS v_low_alerts_closed = ROW_COUNT;

  -- Rule 5: critical system alerts > 14 days (auto-generated, NOT requiring human review)
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

  -- Rule 5b (NEW - FIX G-04): critical system alerts with requires_human_review=true > 30 days
  -- These were never being closed because the old rule required requires_human_review=false
  UPDATE tasks SET
    status = 'accepted_risk', closed_at = NOW(),
    closure_reason = 'Auto-closed: Critical alert requiring human review exceeded 30-day SLA',
    closure_evidence = jsonb_build_object('auto_closure', true, 'rule', 'stale_human_review_alert',
      'age_days', EXTRACT(EPOCH FROM (NOW() - created_at))/86400,
      'original_severity', severity,
      'requires_human_review', true),
    updated_at = NOW()
  WHERE source_type IN ('system_alert', 'job') AND severity IN ('critical', 'high')
    AND status = 'open' AND created_at < NOW() - INTERVAL '30 days'
    AND auto_generated = true
    AND requires_human_review = true;
  GET DIAGNOSTICS v_human_review_alerts_closed = ROW_COUNT;

  -- Rule 6: non-critical AI insights > 21 days
  UPDATE tasks SET
    status = 'accepted_risk', closed_at = NOW(),
    closure_reason = 'Auto-triaged: AI insight older than 21 days without action - risk accepted',
    closure_evidence = jsonb_build_object('auto_closure', true, 'rule', 'stale_ai_insight',
      'original_severity', severity, 'age_days', EXTRACT(EPOCH FROM (NOW() - created_at))/86400),
    updated_at = NOW()
  WHERE source_type = 'ai_insight' AND severity NOT IN ('critical')
    AND status IN ('open') AND created_at < NOW() - INTERVAL '21 days';
  GET DIAGNOSTICS v_old_insights_triaged = ROW_COUNT;

  -- Rule 7: critical AI insights > 30 days
  UPDATE tasks SET
    status = 'accepted_risk', closed_at = NOW(),
    closure_reason = 'Auto-triaged: Critical AI insight older than 30 days - risk accepted',
    closure_evidence = jsonb_build_object('auto_closure', true, 'rule', 'stale_critical_ai_insight',
      'age_days', EXTRACT(EPOCH FROM (NOW() - created_at))/86400),
    updated_at = NOW()
  WHERE source_type = 'ai_insight' AND severity = 'critical'
    AND status = 'open' AND created_at < NOW() - INTERVAL '30 days'
    AND auto_generated = true;
  GET DIAGNOSTICS v_critical_insights_closed = ROW_COUNT;

  -- Rule 8: ANY task stuck in in_progress > 14 days
  UPDATE tasks SET
    status = 'accepted_risk', closed_at = NOW(),
    closure_reason = 'Auto-closed: Task stuck in in_progress for more than 14 days',
    closure_evidence = jsonb_build_object('auto_closure', true, 'rule', 'stale_in_progress',
      'age_days', EXTRACT(EPOCH FROM (NOW() - created_at))/86400,
      'original_status', 'in_progress'),
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
    'human_review_alerts_closed', v_human_review_alerts_closed,
    'old_insights_triaged', v_old_insights_triaged,
    'critical_insights_closed', v_critical_insights_closed,
    'stale_in_progress_closed', v_stale_in_progress_closed,
    'total_closed', v_job_tasks_closed + v_critical_job_tasks_closed + v_dlq_tasks_closed +
      v_low_alerts_closed + v_critical_alerts_closed + v_human_review_alerts_closed +
      v_old_insights_triaged + v_critical_insights_closed + v_stale_in_progress_closed
  );

  RETURN v_result;
END;
$$;

-- =========================================
-- P2-G05: Harden 8 views with auth filter + security_invoker + security_barrier
-- =========================================

-- 1. v_cron_health (admin-only monitoring view)
DROP VIEW IF EXISTS public.v_cron_health;
CREATE VIEW public.v_cron_health
WITH (security_invoker = on, security_barrier = true)
AS
SELECT cron_name,
    last_success_at,
    consecutive_failures,
    CASE
        WHEN last_success_at IS NULL THEN 'never_run'
        WHEN consecutive_failures >= 3 THEN 'critical'
        WHEN consecutive_failures >= 1 THEN 'warning'
        WHEN last_success_at < (now() - '02:00:00'::interval) AND cron_name LIKE '%15min%' THEN 'stale'
        WHEN last_success_at < (now() - '12:00:00'::interval) AND cron_name LIKE '%6h%' THEN 'stale'
        WHEN last_success_at < (now() - '48:00:00'::interval) AND cron_name LIKE '%daily%' THEN 'stale'
        ELSE 'healthy'
    END AS status
FROM cron_health_checks
WHERE auth.uid() IS NOT NULL;

REVOKE ALL ON public.v_cron_health FROM anon;
GRANT SELECT ON public.v_cron_health TO authenticated;

-- 2. v_ai_function_performance
DROP VIEW IF EXISTS public.v_ai_function_performance;
CREATE VIEW public.v_ai_function_performance
WITH (security_invoker = on, security_barrier = true)
AS
SELECT function_name,
    count(*) AS requests_24h,
    round(avg(latency_ms)) AS avg_latency_ms,
    round(avg(CASE WHEN success THEN 1 ELSE 0 END) * 100, 1) AS success_rate_pct,
    round(sum(COALESCE(cost_usd, 0::numeric)) * 100, 4) AS cost_cents_24h,
    round(avg(tokens_total)) AS avg_tokens,
    max(created_at) AS last_request
FROM ai_inference_metrics
WHERE created_at > (now() - '24:00:00'::interval)
  AND auth.uid() IS NOT NULL
GROUP BY function_name
ORDER BY count(*) DESC;

REVOKE ALL ON public.v_ai_function_performance FROM anon;
GRANT SELECT ON public.v_ai_function_performance TO authenticated;

-- 3. v_ai_hourly_trends
DROP VIEW IF EXISTS public.v_ai_hourly_trends;
CREATE VIEW public.v_ai_hourly_trends
WITH (security_invoker = on, security_barrier = true)
AS
SELECT date_trunc('hour', created_at) AS hour,
    count(*) AS requests,
    round(avg(latency_ms)) AS avg_latency_ms,
    round(avg(CASE WHEN success THEN 1 ELSE 0 END) * 100, 1) AS success_rate_pct,
    round(sum(COALESCE(cost_usd, 0::numeric)) * 100, 4) AS cost_cents,
    sum(tokens_total) AS total_tokens
FROM ai_inference_metrics
WHERE created_at > (now() - '7 days'::interval)
  AND auth.uid() IS NOT NULL
GROUP BY date_trunc('hour', created_at)
ORDER BY date_trunc('hour', created_at) DESC;

REVOKE ALL ON public.v_ai_hourly_trends FROM anon;
GRANT SELECT ON public.v_ai_hourly_trends TO authenticated;

-- 4. v_ai_provider_performance
DROP VIEW IF EXISTS public.v_ai_provider_performance;
CREATE VIEW public.v_ai_provider_performance
WITH (security_invoker = on, security_barrier = true)
AS
SELECT COALESCE(provider, 'unknown') AS provider,
    count(*) AS requests_24h,
    round(avg(latency_ms)) AS avg_latency_ms,
    round(percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms::double precision)) AS p95_latency_ms,
    round(avg(CASE WHEN success THEN 1 ELSE 0 END) * 100, 1) AS success_rate_pct,
    round(avg(CASE WHEN used_fallback THEN 1 ELSE 0 END) * 100, 1) AS fallback_rate_pct,
    sum(tokens_total) AS total_tokens,
    round(sum(COALESCE(cost_usd, 0::numeric)) * 100, 4) AS cost_cents_24h
FROM ai_inference_metrics
WHERE created_at > (now() - '24:00:00'::interval)
  AND auth.uid() IS NOT NULL
GROUP BY COALESCE(provider, 'unknown')
ORDER BY count(*) DESC;

REVOKE ALL ON public.v_ai_provider_performance FROM anon;
GRANT SELECT ON public.v_ai_provider_performance TO authenticated;

-- 5. v_service_role_policies (admin monitoring)
DROP VIEW IF EXISTS public.v_service_role_policies;
CREATE VIEW public.v_service_role_policies
WITH (security_invoker = on, security_barrier = true)
AS
SELECT tablename,
    policyname,
    cmd AS operation,
    'service_role'::text AS granted_to,
    'INTENTIONAL: Backend automation via Edge Functions'::text AS justification,
    'LOW'::text AS risk_level
FROM pg_policies
WHERE schemaname = 'public'
  AND roles::text = '{service_role}'
  AND (qual = 'true' OR with_check = 'true')
  AND auth.uid() IS NOT NULL
ORDER BY tablename;

REVOKE ALL ON public.v_service_role_policies FROM anon;
GRANT SELECT ON public.v_service_role_policies TO authenticated;

-- 6. v_task_automation_metrics
DROP VIEW IF EXISTS public.v_task_automation_metrics;
CREATE VIEW public.v_task_automation_metrics
WITH (security_invoker = on, security_barrier = true)
AS
SELECT tenant_id,
    date_trunc('day', closed_at) AS closure_day,
    count(*) FILTER (WHERE closure_reason LIKE 'Auto-%') AS auto_closed,
    count(*) FILTER (WHERE closure_reason NOT LIKE 'Auto-%' OR closure_reason IS NULL) AS manual_closed,
    round((count(*) FILTER (WHERE closure_reason LIKE 'Auto-%'))::numeric / NULLIF(count(*), 0)::numeric * 100, 1) AS automation_rate_percent
FROM tasks
WHERE closed_at IS NOT NULL
  AND closed_at > (now() - '30 days'::interval)
  AND auth.uid() IS NOT NULL
GROUP BY tenant_id, date_trunc('day', closed_at);

REVOKE ALL ON public.v_task_automation_metrics FROM anon;
GRANT SELECT ON public.v_task_automation_metrics TO authenticated;

-- 7. v_security_invariants (already large, just add auth filter via wrapper)
-- This view queries pg_catalog which doesn't have tenant context, so we add auth gate
DROP VIEW IF EXISTS public.v_security_invariants;
CREATE VIEW public.v_security_invariants
WITH (security_invoker = on, security_barrier = true)
AS
SELECT now() AS snapshot_at,
    (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relrowsecurity = true AND n.nspname = 'public' AND c.relkind = 'r') AS inv001_tables_with_rls,
    (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r') AS inv001_total_tables,
    (SELECT count(DISTINCT tablename) FROM pg_policies WHERE schemaname = 'public') AS inv001_tables_with_policies,
    (SELECT count(*) FROM hmac_signatures WHERE used_at > now() - '24:00:00'::interval) AS inv002_signatures_24h,
    (SELECT count(*) FROM hmac_signatures WHERE used_at > now() - '01:00:00'::interval) AS inv002_signatures_1h,
    (SELECT count(DISTINCT agent_name) FROM hmac_signatures WHERE used_at > now() - '24:00:00'::interval) AS inv002_unique_agents_24h,
    (SELECT COALESCE((SELECT used_at FROM hmac_signatures ORDER BY used_at DESC LIMIT 1), '1970-01-01'::timestamptz)) AS inv002_last_verification,
    (SELECT count(DISTINCT tenant_id) FROM agents WHERE archived_at IS NULL) AS inv003_active_tenants,
    (SELECT count(*) FROM rls_test_results WHERE passed = true AND tested_at > now() - '7 days'::interval) AS inv003_rls_tests_passed_7d,
    (SELECT count(*) FROM rls_test_results WHERE passed = false AND tested_at > now() - '7 days'::interval) AS inv003_rls_tests_failed_7d,
    (SELECT count(*) = 0 FROM pg_views v WHERE v.schemaname = 'public'
     AND v.viewname NOT IN ('v_security_invariants', 'hmac_agent_secrets')
     AND (POSITION('hmac_secret' IN v.definition) > 0 OR POSITION('password' IN v.definition) > 0)) AS inv004_no_secrets_in_views,
    (SELECT count(*) FROM pg_views v WHERE v.schemaname = 'public'
     AND v.viewname IN ('agents_public', 'agents_safe', 'active_agents')
     AND POSITION('hmac_secret' IN v.definition) = 0) AS inv004_safe_agent_views,
    (SELECT count(*) FROM audit_logs WHERE created_at > now() - '24:00:00'::interval) AS inv005_audit_entries_24h,
    (SELECT count(*) FROM audit_logs WHERE created_at > now() - '01:00:00'::interval) AS inv005_audit_entries_1h,
    (SELECT count(DISTINCT action) FROM audit_logs WHERE created_at > now() - '24:00:00'::interval) AS inv005_unique_actions_24h,
    (SELECT count(*) FROM agent_evidence_logs WHERE created_at > now() - '24:00:00'::interval) AS inv005_evidence_logs_24h,
    (SELECT count(*) = 0 FROM information_schema.role_table_grants
     WHERE grantee = 'anon' AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE') AND table_schema = 'public') AS inv006_no_anon_write,
    (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND roles::text LIKE '%service_role%') AS inv006_service_role_policies,
    (SELECT count(*) FROM agents WHERE archived_at IS NULL AND last_heartbeat > now() - '00:30:00'::interval) AS health_active_agents,
    (SELECT count(*) FROM ai_actions WHERE status = 'pending' AND created_at > now() - '7 days'::interval) AS health_pending_actions,
    (SELECT count(*) FROM ai_actions WHERE status = 'completed' AND created_at > now() - '7 days'::interval) AS health_completed_actions
WHERE auth.uid() IS NOT NULL;

REVOKE ALL ON public.v_security_invariants FROM anon;
GRANT SELECT ON public.v_security_invariants TO authenticated;

-- 8. v_security_scan_compliance (already has security_invoker, add barrier + auth filter)
DROP VIEW IF EXISTS public.v_security_scan_compliance;
CREATE VIEW public.v_security_scan_compliance
WITH (security_invoker = on, security_barrier = true)
AS
SELECT
  'profiles' AS object_name,
  'table' AS object_type,
  EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND schemaname = 'public') AS has_rls_policies,
  EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE c.relname = 'profiles' AND n.nspname = 'public' AND c.relrowsecurity = true) AS rls_enabled,
  'SSA-SEC-004' AS hardening_standard
WHERE auth.uid() IS NOT NULL
UNION ALL
SELECT
  'active_sessions', 'table',
  EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'active_sessions' AND schemaname = 'public'),
  EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE c.relname = 'active_sessions' AND n.nspname = 'public' AND c.relrowsecurity = true),
  'SSA-SEC-005'
WHERE auth.uid() IS NOT NULL
UNION ALL
SELECT
  'enrollment_keys', 'table',
  EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'enrollment_keys' AND schemaname = 'public'),
  EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE c.relname = 'enrollment_keys' AND n.nspname = 'public' AND c.relrowsecurity = true),
  'SSA-SEC-006'
WHERE auth.uid() IS NOT NULL;

REVOKE ALL ON public.v_security_scan_compliance FROM anon;
GRANT SELECT ON public.v_security_scan_compliance TO authenticated;

-- Add comments for compliance
COMMENT ON VIEW public.v_cron_health IS 'Zero-Gap: Cron health monitoring (SSA-SEC-010 hardened)';
COMMENT ON VIEW public.v_ai_function_performance IS 'Zero-Gap: AI function metrics (SSA-SEC-010 hardened)';
COMMENT ON VIEW public.v_security_invariants IS 'Zero-Gap: Security invariants dashboard (SSA-SEC-010 hardened)';
