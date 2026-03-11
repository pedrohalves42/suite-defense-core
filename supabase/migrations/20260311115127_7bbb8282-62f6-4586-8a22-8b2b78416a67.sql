
-- ============================================================
-- V-801: Fix 12 views - add security_invoker + tenant filtering where applicable
-- V-804: Fix active_sessions RLS policy
-- ============================================================

-- v_job_health: scheduled_job_runs is system-level, add security options
CREATE OR REPLACE VIEW public.v_job_health
WITH (security_invoker = on, security_barrier = true)
AS
SELECT job_key, job_source,
    count(*) AS total_runs_24h,
    count(*) FILTER (WHERE success IS TRUE) AS success_count_24h,
    count(*) FILTER (WHERE success IS FALSE) AS failure_count_24h,
    max(ran_at) AS last_run,
    max(ran_at) FILTER (WHERE success IS TRUE) AS last_success,
    max(ran_at) FILTER (WHERE success IS FALSE) AS last_failure,
    avg(duration_ms)::numeric(10,2) AS avg_duration_ms,
    max(duration_ms)::numeric(10,2) AS max_duration_ms,
    CASE
        WHEN count(*) = 0 THEN 'never_ran'
        WHEN max(ran_at) < (now() - '02:00:00'::interval) THEN 'stale'
        WHEN count(*) FILTER (WHERE success IS FALSE AND ran_at > (now() - '01:00:00'::interval)) > 3 THEN 'critical'
        WHEN count(*) FILTER (WHERE success IS FALSE AND ran_at > (now() - '02:00:00'::interval)) > 0 THEN 'warning'
        ELSE 'healthy'
    END AS health_status,
    CASE
        WHEN count(*) = 0 THEN 'low'
        WHEN max(ran_at) < (now() - '02:00:00'::interval) THEN 'medium'
        WHEN count(*) FILTER (WHERE success IS FALSE AND ran_at > (now() - '01:00:00'::interval)) > 3 THEN 'critical'
        WHEN count(*) FILTER (WHERE success IS FALSE AND ran_at > (now() - '02:00:00'::interval)) > 0 THEN 'high'
        ELSE 'low'
    END AS severity
FROM scheduled_job_runs
WHERE ran_at > (now() - '24:00:00'::interval) AND is_current_super_admin()
GROUP BY job_key, job_source;

-- v_cron_silence
CREATE OR REPLACE VIEW public.v_cron_silence
WITH (security_invoker = on, security_barrier = true)
AS
SELECT job_key, last_seen_at, expected_interval,
    (now() - last_seen_at) AS silence_duration, missed_count, last_error,
    CASE
        WHEN (now() - last_seen_at) > (expected_interval * 3::double precision) THEN 'critical'
        WHEN (now() - last_seen_at) > (expected_interval * 2::double precision) THEN 'warning'
        ELSE 'ok'
    END AS status
FROM scheduled_job_heartbeat h
WHERE (now() - last_seen_at) > expected_interval AND is_current_super_admin();

-- v_anomalies_without_runbook
CREATE OR REPLACE VIEW public.v_anomalies_without_runbook
WITH (security_invoker = on, security_barrier = true)
AS
SELECT DISTINCT anomaly_type
FROM v_job_health_anomalies
WHERE NOT (anomaly_type IN (SELECT anomaly_type FROM runbooks))
  AND is_current_super_admin();

-- v_incident_groups_with_slo
CREATE OR REPLACE VIEW public.v_incident_groups_with_slo
WITH (security_invoker = on, security_barrier = true)
AS
SELECT ig.id, ig.fingerprint_hash, ig.source_type, ig.failure_class,
    ig.normalized_signature, ig.severity_hint, ig.total_occurrences,
    ig.distinct_tenants, ig.distinct_agents, ig.first_seen_at, ig.last_seen_at,
    ig.is_active, ig.is_ongoing,
    COALESCE(slo.slo_target, 99.0) AS slo_target,
    COALESCE(slo.error_budget, 0.01) AS error_budget,
    COALESCE(slo.burn_rate_1h, 0::numeric) AS burn_rate_1h,
    COALESCE(slo.burn_rate_6h, 0::numeric) AS burn_rate_6h,
    COALESCE(slo.burn_rate_24h, 0::numeric) AS burn_rate_24h,
    COALESCE(slo.budget_consumed, 0::numeric) AS budget_consumed,
    COALESCE(slo.budget_remaining, 100::numeric) AS budget_remaining,
    COALESCE(slo.status, 'ok') AS slo_status,
    COALESCE(slo.occurrences_1h, 0) AS occurrences_1h,
    COALESCE(slo.occurrences_6h, 0) AS occurrences_6h,
    slo.last_evaluated_at
FROM v_incident_groups ig
LEFT JOIN incident_slo_state slo ON slo.fingerprint_id = ig.id
WHERE is_current_super_admin()
ORDER BY COALESCE(slo.burn_rate_1h, 0::numeric) DESC NULLS LAST,
    (ig.severity_hint = 'critical') DESC, ig.total_occurrences DESC;

-- v_integrity_score: add tenant filter on jobs subquery
CREATE OR REPLACE VIEW public.v_integrity_score
WITH (security_invoker = on, security_barrier = true)
AS
WITH release_stats AS (
    SELECT count(*) FILTER (WHERE is_active = true) AS active_releases,
        count(*) FILTER (WHERE is_active = true AND signature_base64 IS NOT NULL) AS valid_active_releases,
        count(*) AS total_releases,
        count(*) FILTER (WHERE signature_base64 IS NOT NULL) AS signed_releases
    FROM agent_releases WHERE is_current_super_admin()
), job_stats AS (
    SELECT count(*) AS total_jobs,
        count(*) FILTER (WHERE status = 'completed') AS completed_jobs,
        count(*) FILTER (WHERE status = 'completed' AND output IS NOT NULL) AS valid_completed_jobs,
        count(*) FILTER (WHERE status = 'failed') AS failed_jobs,
        count(*) FILTER (WHERE status = 'failed' AND error_message IS NOT NULL) AS failed_with_error
    FROM jobs
    WHERE created_at >= (now() - '7 days'::interval) AND is_current_super_admin()
      AND (tenant_id = get_active_tenant_id() OR get_active_tenant_id() IS NULL)
)
SELECT COALESCE(CASE WHEN rs.active_releases > 0 THEN round((rs.valid_active_releases::numeric / rs.active_releases::numeric) * 100, 1) ELSE 100::numeric END, 100::numeric) AS supply_chain_score,
    COALESCE(CASE WHEN js.completed_jobs > 0 THEN round((js.valid_completed_jobs::numeric / js.completed_jobs::numeric) * 100, 1) ELSE 100::numeric END, 100::numeric) AS job_integrity_score,
    COALESCE(CASE WHEN js.failed_jobs > 0 THEN round((js.failed_with_error::numeric / js.failed_jobs::numeric) * 100, 1) ELSE 100::numeric END, 100::numeric) AS failed_jobs_score,
    COALESCE(round(((CASE WHEN rs.active_releases > 0 THEN rs.valid_active_releases::numeric / rs.active_releases::numeric ELSE 1::numeric END * 0.4) + (CASE WHEN js.completed_jobs > 0 THEN js.valid_completed_jobs::numeric / js.completed_jobs::numeric ELSE 1::numeric END * 0.4) + (CASE WHEN js.failed_jobs > 0 THEN js.failed_with_error::numeric / js.failed_jobs::numeric ELSE 1::numeric END * 0.2)) * 100, 1), 100::numeric) AS global_integrity_score,
    COALESCE(rs.active_releases, 0::bigint) AS active_releases,
    COALESCE(rs.valid_active_releases, 0::bigint) AS valid_active_releases,
    COALESCE(rs.total_releases, 0::bigint) AS total_releases,
    COALESCE(rs.signed_releases, 0::bigint) AS signed_releases,
    COALESCE(js.completed_jobs, 0::bigint) AS completed_jobs,
    COALESCE(js.valid_completed_jobs, 0::bigint) AS valid_completed_jobs,
    COALESCE(js.failed_jobs, 0::bigint) AS failed_jobs,
    COALESCE(js.failed_with_error, 0::bigint) AS failed_with_error,
    now() AS calculated_at
FROM release_stats rs CROSS JOIN job_stats js;

-- v_security_dashboard: add tenant filter on security_logs and agents
CREATE OR REPLACE VIEW public.v_security_dashboard
WITH (security_invoker = on, security_barrier = true)
AS
SELECT 'security_summary'::text AS metric_type,
    (SELECT count(*) FROM security_logs WHERE created_at > (now() - '24:00:00'::interval)
      AND (tenant_id = get_active_tenant_id() OR get_active_tenant_id() IS NULL)) AS events_24h,
    (SELECT count(*) FROM security_logs WHERE severity = 'critical' AND created_at > (now() - '24:00:00'::interval)
      AND (tenant_id = get_active_tenant_id() OR get_active_tenant_id() IS NULL)) AS critical_events_24h,
    (SELECT count(*) FROM agents WHERE archived_at IS NULL
      AND (tenant_id = get_active_tenant_id() OR get_active_tenant_id() IS NULL)) AS active_agents,
    now() AS generated_at
WHERE auth.uid() IS NOT NULL AND is_current_super_admin();

-- v_zero_gap_dashboard: add tenant filter on tenant-scoped tables
CREATE OR REPLACE VIEW public.v_zero_gap_dashboard
WITH (security_invoker = on, security_barrier = true)
AS
WITH orphan_tasks AS (
    SELECT count(*) AS cnt FROM tasks
    WHERE assigned_to IS NULL AND status <> ALL (ARRAY['completed','cancelled','resolved'])
      AND (tenant_id = get_active_tenant_id() OR get_active_tenant_id() IS NULL)
), zombie_jobs AS (
    SELECT count(*) AS cnt FROM jobs
    WHERE status = ANY (ARRAY['pending','in_progress','queued'])
      AND created_at < (now() - '04:00:00'::interval)
      AND (tenant_id = get_active_tenant_id() OR get_active_tenant_id() IS NULL)
), stale_crons AS (
    SELECT count(*) AS cnt FROM cron_health WHERE last_success_at < (now() - '04:00:00'::interval)
), secured_views AS (
    SELECT count(*) AS cnt FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'v' AND c.reloptions::text ~~ '%security_invoker=on%'
), total_views AS (
    SELECT count(*) AS cnt FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'v'
), failed_no_error AS (
    SELECT count(*) AS cnt FROM jobs WHERE status = 'failed' AND error_message IS NULL
      AND (tenant_id = get_active_tenant_id() OR get_active_tenant_id() IS NULL)
)
SELECT ot.cnt AS orphan_tasks, zj.cnt AS zombie_jobs, sc.cnt AS stale_crons,
    sv.cnt AS secured_views, tv.cnt AS total_views,
    round((sv.cnt::numeric / NULLIF(tv.cnt, 0)::numeric) * 100, 1) AS view_security_coverage_pct,
    fe.cnt AS failed_jobs_no_error,
    CASE WHEN zj.cnt > 0 OR sc.cnt > 0 OR fe.cnt > 5 THEN 'CRITICAL'
        WHEN ot.cnt > 10 THEN 'WARNING' ELSE 'HEALTHY' END AS system_status,
    now() AS checked_at
FROM orphan_tasks ot, zombie_jobs zj, stale_crons sc, secured_views sv, total_views tv, failed_no_error fe
WHERE is_current_super_admin();

-- v_zero_gap_health: add tenant filter on tenant-scoped tables
CREATE OR REPLACE VIEW public.v_zero_gap_health
WITH (security_invoker = on, security_barrier = true)
AS
SELECT 
    (SELECT count(*) FROM jobs WHERE status = ANY (ARRAY['pending','queued','delivered']) AND expires_at < now()
      AND (tenant_id = get_active_tenant_id() OR get_active_tenant_id() IS NULL)) AS expired_jobs_stuck,
    (SELECT count(*) FROM jobs WHERE status = 'delivered' AND created_at < (now() - '02:00:00'::interval)
      AND (tenant_id = get_active_tenant_id() OR get_active_tenant_id() IS NULL)) AS zombie_delivered,
    (SELECT count(*) FROM failed_jobs_dlq WHERE status = 'pending'
      AND (tenant_id = get_active_tenant_id() OR get_active_tenant_id() IS NULL)) AS dlq_pending,
    (SELECT count(*) FROM failed_jobs_dlq WHERE status = 'exhausted'
      AND (tenant_id = get_active_tenant_id() OR get_active_tenant_id() IS NULL)) AS dlq_exhausted,
    (SELECT count(*) FROM tasks WHERE status = ANY (ARRAY['open','in_progress']) AND updated_at < (now() - '14 days'::interval)
      AND (tenant_id = get_active_tenant_id() OR get_active_tenant_id() IS NULL)) AS stale_tasks,
    (SELECT count(*) FROM cron_health_checks WHERE consecutive_failures > 3) AS failing_crons,
    (SELECT count(*) FROM domain_events
      WHERE (tenant_id = get_active_tenant_id() OR get_active_tenant_id() IS NULL)) AS domain_events_total,
    (SELECT count(*) FROM jobs WHERE status = ANY (ARRAY['pending','queued','delivered'])
      AND (tenant_id = get_active_tenant_id() OR get_active_tenant_id() IS NULL)) AS active_jobs,
    (SELECT count(*) FROM jobs WHERE status = 'completed' AND created_at > (now() - '24:00:00'::interval)
      AND (tenant_id = get_active_tenant_id() OR get_active_tenant_id() IS NULL)) AS completed_24h,
    (SELECT count(*) FROM jobs WHERE status = 'failed' AND created_at > (now() - '24:00:00'::interval)
      AND (tenant_id = get_active_tenant_id() OR get_active_tenant_id() IS NULL)) AS failed_24h
WHERE auth.uid() IS NOT NULL AND is_current_super_admin();

-- v_rls_continuous_check: system catalog, add security options
CREATE OR REPLACE VIEW public.v_rls_continuous_check
WITH (security_invoker = on, security_barrier = true)
AS
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled,
    (SELECT count(*) FROM pg_policies p WHERE p.tablename = c.relname::text)::integer AS policy_count,
    CASE WHEN NOT c.relrowsecurity THEN 'CRITICAL'
        WHEN (SELECT count(*) FROM pg_policies p WHERE p.tablename = c.relname::text) = 0 THEN 'WARNING'
        ELSE 'OK' END AS status
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r' AND n.nspname = 'public' AND is_current_super_admin();

-- v_rls_security_status
CREATE OR REPLACE VIEW public.v_rls_security_status
WITH (security_invoker = on, security_barrier = true)
AS
SELECT id, test_run_id, test_name, table_name, passed, failure_reason, tested_at, details
FROM rls_test_results rt WHERE is_current_super_admin();

-- v_database_size_report: system catalog
CREATE OR REPLACE VIEW public.v_database_size_report
WITH (security_invoker = on, security_barrier = true)
AS
SELECT schemaname, relname AS table_name,
    pg_size_pretty(pg_total_relation_size(relid::regclass)) AS total_size,
    pg_size_pretty(pg_relation_size(relid::regclass)) AS table_size,
    pg_size_pretty(pg_total_relation_size(relid::regclass) - pg_relation_size(relid::regclass)) AS index_size,
    n_tup_ins AS rows_inserted, n_tup_del AS rows_deleted, last_autovacuum
FROM pg_stat_user_tables
WHERE schemaname = 'public' AND is_current_super_admin()
ORDER BY pg_total_relation_size(relid::regclass) DESC;

-- v_system_contracts: enum values
CREATE OR REPLACE VIEW public.v_system_contracts
WITH (security_invoker = on, security_barrier = true)
AS
SELECT 'task_source_type'::text AS contract,
    unnest(ARRAY['ai_insight','system_alert','playbook_execution','red_team','manual','job','dlq']) AS value
WHERE is_current_super_admin() OR auth.uid() IS NOT NULL
UNION ALL
SELECT 'job_status'::text AS contract,
    unnest(ARRAY['pending','in_progress','completed','failed','cancelled','timeout','delivered','ack_timeout']) AS value
WHERE is_current_super_admin() OR auth.uid() IS NOT NULL
UNION ALL
SELECT 'failure_class'::text AS contract,
    unnest(ARRAY['TRANSIENT','PERMANENT','EXPECTED_DROP','BUG','UNKNOWN']) AS value
WHERE is_current_super_admin() OR auth.uid() IS NOT NULL;

-- ============================================================
-- V-804: Fix active_sessions RLS - add tenant scoping
-- ============================================================
DROP POLICY IF EXISTS "active_sessions_super_admin" ON public.active_sessions;
CREATE POLICY "active_sessions_super_admin"
ON public.active_sessions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'super_admin'::app_role
  )
  AND (active_sessions.tenant_id IS NULL OR active_sessions.tenant_id = get_active_tenant_id())
);
