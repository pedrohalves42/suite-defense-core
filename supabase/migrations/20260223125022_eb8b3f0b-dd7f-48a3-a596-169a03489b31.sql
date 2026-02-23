
-- =============================================================================
-- V-301 FIX (CRITICAL): Revoke anon/public from SECURITY DEFINER RPCs
-- =============================================================================
REVOKE ALL ON FUNCTION public.create_job_if_not_exists(uuid, uuid, text, jsonb, integer, integer) FROM anon, public;
REVOKE ALL ON FUNCTION public.create_job_if_not_exists(uuid, text, uuid, integer, jsonb, integer, integer, text) FROM anon, public;
REVOKE ALL ON FUNCTION public.enter_autonomous_safe_mode(uuid, text) FROM anon, public;
REVOKE ALL ON FUNCTION public.enter_autonomous_safe_mode(uuid, text, text, integer) FROM anon, public;
REVOKE ALL ON FUNCTION public.finalize_job_execution(uuid, uuid, text, integer, text, text) FROM anon, public;
REVOKE ALL ON FUNCTION public.finalize_job_execution(uuid, uuid, uuid, text, timestamptz, timestamptz, text, text, numeric, text, boolean, text, text, bigint) FROM anon, public;
REVOKE ALL ON FUNCTION public.register_agent_signing_key(uuid, text, text, text) FROM anon, public;

-- =============================================================================
-- V-303 FIX (MEDIUM): Harden 3 global views with super_admin guard
-- Must DROP + CREATE to preserve original column structure
-- =============================================================================

-- 1) v_database_size_report
DROP VIEW IF EXISTS public.v_database_size_report;
CREATE VIEW public.v_database_size_report
WITH (security_invoker = on, security_barrier = true)
AS
SELECT schemaname,
    relname AS table_name,
    pg_size_pretty(pg_total_relation_size(relid::regclass)) AS total_size,
    pg_size_pretty(pg_relation_size(relid::regclass)) AS table_size,
    pg_size_pretty(pg_total_relation_size(relid::regclass) - pg_relation_size(relid::regclass)) AS index_size,
    n_tup_ins AS rows_inserted,
    n_tup_del AS rows_deleted,
    last_autovacuum
FROM pg_stat_user_tables
WHERE schemaname = 'public'
  AND is_current_super_admin()
ORDER BY pg_total_relation_size(relid::regclass) DESC;

COMMENT ON VIEW public.v_database_size_report IS 'Global view - restricted to super_admin only (V-303)';

-- 2) v_security_invariants
DROP VIEW IF EXISTS public.v_security_invariants;
CREATE VIEW public.v_security_invariants
WITH (security_invoker = on, security_barrier = true)
AS
SELECT now() AS snapshot_at,
    (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relrowsecurity = true AND n.nspname = 'public' AND c.relkind = 'r') AS inv001_tables_with_rls,
    (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r') AS inv001_total_tables,
    (SELECT count(DISTINCT tablename) FROM pg_policies WHERE schemaname = 'public') AS inv001_tables_with_policies,
    (SELECT count(*) FROM hmac_signatures WHERE used_at > now() - interval '24 hours') AS inv002_signatures_24h,
    (SELECT count(*) FROM hmac_signatures WHERE used_at > now() - interval '1 hour') AS inv002_signatures_1h,
    (SELECT count(DISTINCT agent_name) FROM hmac_signatures WHERE used_at > now() - interval '24 hours') AS inv002_unique_agents_24h,
    (SELECT COALESCE((SELECT used_at FROM hmac_signatures ORDER BY used_at DESC LIMIT 1), '1970-01-01'::timestamptz)) AS inv002_last_verification,
    (SELECT count(DISTINCT tenant_id) FROM agents WHERE archived_at IS NULL) AS inv003_active_tenants,
    (SELECT count(*) FROM rls_test_results WHERE passed = true AND tested_at > now() - interval '7 days') AS inv003_rls_tests_passed_7d,
    (SELECT count(*) FROM rls_test_results WHERE passed = false AND tested_at > now() - interval '7 days') AS inv003_rls_tests_failed_7d,
    (SELECT count(*) = 0 FROM pg_views v WHERE v.schemaname = 'public' AND v.viewname NOT IN ('v_security_invariants','hmac_agent_secrets') AND (position('hmac_secret' in v.definition) > 0 OR position('password' in v.definition) > 0)) AS inv004_no_secrets_in_views,
    (SELECT count(*) FROM pg_views v WHERE v.schemaname = 'public' AND v.viewname IN ('agents_public','agents_safe','active_agents') AND position('hmac_secret' in v.definition) = 0) AS inv004_safe_agent_views,
    (SELECT count(*) FROM audit_logs WHERE created_at > now() - interval '24 hours') AS inv005_audit_entries_24h,
    (SELECT count(*) FROM audit_logs WHERE created_at > now() - interval '1 hour') AS inv005_audit_entries_1h,
    (SELECT count(DISTINCT action) FROM audit_logs WHERE created_at > now() - interval '24 hours') AS inv005_unique_actions_24h,
    (SELECT count(*) FROM agent_evidence_logs WHERE created_at > now() - interval '24 hours') AS inv005_evidence_logs_24h,
    (SELECT count(*) = 0 FROM information_schema.role_table_grants WHERE grantee = 'anon' AND privilege_type IN ('INSERT','UPDATE','DELETE') AND table_schema = 'public') AS inv006_no_anon_write,
    (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND roles::text LIKE '%service_role%') AS inv006_service_role_policies,
    (SELECT count(*) FROM agents WHERE archived_at IS NULL AND last_heartbeat > now() - interval '30 minutes') AS health_active_agents,
    (SELECT count(*) FROM ai_actions WHERE status = 'pending' AND created_at > now() - interval '7 days') AS health_pending_actions,
    (SELECT count(*) FROM ai_actions WHERE status = 'completed' AND created_at > now() - interval '7 days') AS health_completed_actions
WHERE is_current_super_admin();

COMMENT ON VIEW public.v_security_invariants IS 'Global view - restricted to super_admin only (V-303)';

-- 3) v_zero_gap_dashboard
DROP VIEW IF EXISTS public.v_zero_gap_dashboard;
CREATE VIEW public.v_zero_gap_dashboard
WITH (security_invoker = on, security_barrier = true)
AS
WITH orphan_tasks AS (
  SELECT count(*) AS cnt FROM tasks WHERE assigned_to IS NULL AND status NOT IN ('completed','cancelled','resolved')
), zombie_jobs AS (
  SELECT count(*) AS cnt FROM jobs WHERE status IN ('pending','in_progress','queued') AND created_at < now() - interval '4 hours'
), stale_crons AS (
  SELECT count(*) AS cnt FROM cron_health WHERE last_success_at < now() - interval '4 hours'
), secured_views AS (
  SELECT count(*) AS cnt FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'v' AND c.reloptions::text LIKE '%security_invoker=on%'
), total_views AS (
  SELECT count(*) AS cnt FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'v'
), failed_no_error AS (
  SELECT count(*) AS cnt FROM jobs WHERE status = 'failed' AND error_message IS NULL
)
SELECT ot.cnt AS orphan_tasks,
    zj.cnt AS zombie_jobs,
    sc.cnt AS stale_crons,
    sv.cnt AS secured_views,
    tv.cnt AS total_views,
    round((sv.cnt::numeric / NULLIF(tv.cnt, 0)::numeric) * 100, 1) AS view_security_coverage_pct,
    fe.cnt AS failed_jobs_no_error,
    CASE
        WHEN zj.cnt > 0 OR sc.cnt > 0 OR fe.cnt > 5 THEN 'CRITICAL'
        WHEN ot.cnt > 10 THEN 'WARNING'
        ELSE 'HEALTHY'
    END AS system_status,
    now() AS checked_at
FROM orphan_tasks ot, zombie_jobs zj, stale_crons sc, secured_views sv, total_views tv, failed_no_error fe
WHERE is_current_super_admin();

COMMENT ON VIEW public.v_zero_gap_dashboard IS 'Global view - restricted to super_admin only (V-303)';
