
-- Fix 1: v_database_size_report - add security_invoker=on 
-- This view accesses pg_stat_user_tables which needs elevated access
-- Since it's admin-only, we recreate with security_invoker and restrict via RLS on underlying tables
DROP VIEW IF EXISTS public.v_database_size_report;
CREATE OR REPLACE VIEW public.v_database_size_report
WITH (security_invoker = on, security_barrier = true) AS
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
ORDER BY pg_total_relation_size(relid::regclass) DESC;

COMMENT ON VIEW public.v_database_size_report IS 'SSA-SEC-010: Admin-only database size report. Uses security_invoker=on. Access controlled by caller permissions.';

-- Fix 2: v_security_invariants - change to security_invoker=on
-- This view monitors security posture and accesses system catalogs
DROP VIEW IF EXISTS public.v_security_invariants;
CREATE OR REPLACE VIEW public.v_security_invariants
WITH (security_invoker = on, security_barrier = true) AS
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
    (SELECT count(*) = 0 FROM pg_views v WHERE v.schemaname = 'public' AND v.viewname NOT IN ('v_security_invariants', 'hmac_agent_secrets') AND (position('hmac_secret' IN v.definition) > 0 OR position('password' IN v.definition) > 0)) AS inv004_no_secrets_in_views,
    (SELECT count(*) FROM pg_views v WHERE v.schemaname = 'public' AND v.viewname IN ('agents_public', 'agents_safe', 'active_agents') AND position('hmac_secret' IN v.definition) = 0) AS inv004_safe_agent_views,
    (SELECT count(*) FROM audit_logs WHERE created_at > now() - interval '24 hours') AS inv005_audit_entries_24h,
    (SELECT count(*) FROM audit_logs WHERE created_at > now() - interval '1 hour') AS inv005_audit_entries_1h,
    (SELECT count(DISTINCT action) FROM audit_logs WHERE created_at > now() - interval '24 hours') AS inv005_unique_actions_24h,
    (SELECT count(*) FROM agent_evidence_logs WHERE created_at > now() - interval '24 hours') AS inv005_evidence_logs_24h,
    (SELECT count(*) = 0 FROM information_schema.role_table_grants WHERE grantee = 'anon' AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE') AND table_schema = 'public') AS inv006_no_anon_write,
    (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND roles::text LIKE '%service_role%') AS inv006_service_role_policies,
    (SELECT count(*) FROM agents WHERE archived_at IS NULL AND last_heartbeat > now() - interval '30 minutes') AS health_active_agents,
    (SELECT count(*) FROM ai_actions WHERE status = 'pending' AND created_at > now() - interval '7 days') AS health_pending_actions,
    (SELECT count(*) FROM ai_actions WHERE status = 'completed' AND created_at > now() - interval '7 days') AS health_completed_actions;

COMMENT ON VIEW public.v_security_invariants IS 'SSA-SEC-010: Security invariants monitoring view. Uses security_invoker=on. Accesses system catalogs for security posture assessment. Intentionally global for admin/service_role monitoring.';
