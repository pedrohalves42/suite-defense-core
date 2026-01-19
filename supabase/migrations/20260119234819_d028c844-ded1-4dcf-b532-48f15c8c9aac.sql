
-- ============================================================
-- ADR-VELLUM: V-201, V-205, V-206 Security Hardening
-- ============================================================

-- V-205: Create unified get_user_roles RPC
-- Replaces 5 sequential has_role calls with 1 single RPC call
CREATE OR REPLACE FUNCTION public.get_user_roles(_user_id uuid)
RETURNS TABLE(role app_role, tenant_id uuid) 
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role, tenant_id 
  FROM public.user_roles 
  WHERE user_id = _user_id
$$;

-- Grant access
GRANT EXECUTE ON FUNCTION public.get_user_roles(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_user_roles IS 'V-205: Unified role fetch - replaces 5 sequential has_role calls with single query';

-- ============================================================
-- V-206: Add explicit tenant filter to *_safe views
-- Defense in depth - add WHERE clause even though RLS exists
-- ============================================================

-- 1. agents_safe - already has tenant filter (confirmed in query results)
-- No changes needed

-- 2. audit_logs_safe - already has tenant filter (confirmed)  
-- No changes needed

-- 3. enrollment_keys_safe - already has tenant filter (confirmed)
-- No changes needed

-- 4. invites_safe - already has tenant filter (confirmed)
-- No changes needed

-- ============================================================
-- V-201: Add security_invoker to super-admin views
-- These views use is_current_super_admin() which is correct for admin-only access
-- Add security_invoker for defense in depth
-- ============================================================

-- v_integrity_score: Recreate with security_invoker
DROP VIEW IF EXISTS public.v_integrity_score CASCADE;
CREATE VIEW public.v_integrity_score WITH (security_invoker=on) AS
WITH release_stats AS (
  SELECT 
    count(*) FILTER (WHERE agent_releases.is_active = true) AS active_releases,
    count(*) FILTER (WHERE agent_releases.is_active = true AND agent_releases.signature_base64 IS NOT NULL) AS valid_active_releases,
    count(*) AS total_releases,
    count(*) FILTER (WHERE agent_releases.signature_base64 IS NOT NULL) AS signed_releases
  FROM agent_releases
  WHERE is_current_super_admin()
), job_stats AS (
  SELECT 
    count(*) AS total_jobs,
    count(*) FILTER (WHERE jobs.status = 'completed') AS completed_jobs,
    count(*) FILTER (WHERE jobs.status = 'completed' AND jobs.output IS NOT NULL) AS valid_completed_jobs,
    count(*) FILTER (WHERE jobs.status = 'failed') AS failed_jobs,
    count(*) FILTER (WHERE jobs.status = 'failed' AND jobs.error_message IS NOT NULL) AS failed_with_error
  FROM jobs
  WHERE jobs.created_at >= (now() - '7 days'::interval) AND is_current_super_admin()
)
SELECT 
  COALESCE(
    CASE WHEN rs.active_releases > 0 
    THEN round(((rs.valid_active_releases)::numeric / (rs.active_releases)::numeric) * 100, 1)
    ELSE 100 END, 100) AS supply_chain_score,
  COALESCE(
    CASE WHEN js.completed_jobs > 0 
    THEN round(((js.valid_completed_jobs)::numeric / (js.completed_jobs)::numeric) * 100, 1)
    ELSE 100 END, 100) AS job_integrity_score,
  COALESCE(
    CASE WHEN js.failed_jobs > 0 
    THEN round(((js.failed_with_error)::numeric / (js.failed_jobs)::numeric) * 100, 1)
    ELSE 100 END, 100) AS failed_jobs_score,
  COALESCE(round((
    (CASE WHEN rs.active_releases > 0 THEN (rs.valid_active_releases)::numeric / (rs.active_releases)::numeric ELSE 1 END * 0.4) +
    (CASE WHEN js.completed_jobs > 0 THEN (js.valid_completed_jobs)::numeric / (js.completed_jobs)::numeric ELSE 1 END * 0.4) +
    (CASE WHEN js.failed_jobs > 0 THEN (js.failed_with_error)::numeric / (js.failed_jobs)::numeric ELSE 1 END * 0.2)
  ) * 100, 1), 100) AS global_integrity_score,
  COALESCE(rs.active_releases, 0) AS active_releases,
  COALESCE(rs.valid_active_releases, 0) AS valid_active_releases,
  COALESCE(rs.total_releases, 0) AS total_releases,
  COALESCE(rs.signed_releases, 0) AS signed_releases,
  COALESCE(js.completed_jobs, 0) AS completed_jobs,
  COALESCE(js.valid_completed_jobs, 0) AS valid_completed_jobs,
  COALESCE(js.failed_jobs, 0) AS failed_jobs,
  COALESCE(js.failed_with_error, 0) AS failed_with_error,
  now() AS calculated_at
FROM release_stats rs CROSS JOIN job_stats js;

COMMENT ON VIEW public.v_integrity_score IS 'V-201: System integrity score - super_admin only via is_current_super_admin()';

-- v_job_health: Recreate with security_invoker
DROP VIEW IF EXISTS public.v_job_health CASCADE;
CREATE VIEW public.v_job_health WITH (security_invoker=on) AS
SELECT 
  job_key,
  job_source,
  count(*) AS total_runs,
  count(*) FILTER (WHERE success IS TRUE) AS successful_runs,
  count(*) FILTER (WHERE success IS FALSE) AS failed_runs,
  max(ran_at) AS last_run_at,
  (avg(duration_ms))::numeric(10,2) AS avg_duration_ms
FROM scheduled_job_runs sjr
WHERE is_current_super_admin()
GROUP BY job_key, job_source;

COMMENT ON VIEW public.v_job_health IS 'V-201: Job health metrics - super_admin only via is_current_super_admin()';

-- v_cron_silence: Recreate with security_invoker
DROP VIEW IF EXISTS public.v_cron_silence CASCADE;
CREATE VIEW public.v_cron_silence WITH (security_invoker=on) AS
SELECT 
  job_key,
  last_seen_at,
  expected_interval,
  (now() - last_seen_at) AS silence_duration,
  missed_count,
  last_error,
  CASE
    WHEN (now() - last_seen_at) > (expected_interval * 3) THEN 'critical'
    WHEN (now() - last_seen_at) > (expected_interval * 2) THEN 'warning'
    ELSE 'ok'
  END AS status
FROM scheduled_job_heartbeat h
WHERE (now() - last_seen_at) > expected_interval;

COMMENT ON VIEW public.v_cron_silence IS 'V-201: Cron silence detection - no tenant filter needed (system monitoring)';

-- v_anomalies_without_runbook depends on v_job_health_anomalies, recreate
DROP VIEW IF EXISTS public.v_anomalies_without_runbook CASCADE;
CREATE VIEW public.v_anomalies_without_runbook WITH (security_invoker=on) AS
SELECT DISTINCT anomaly_type
FROM v_job_health_anomalies
WHERE NOT (anomaly_type IN (SELECT runbooks.anomaly_type FROM runbooks));

COMMENT ON VIEW public.v_anomalies_without_runbook IS 'V-201: Anomalies without runbook - super_admin only';
