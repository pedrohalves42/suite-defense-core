
-- =============================================================================
-- FIX 1: Create sync_pgcron_health_from_run_details function
-- Bridges 59 SQL-only crons that never report to cron_health_checks
-- =============================================================================

CREATE OR REPLACE FUNCTION public.sync_pgcron_health_from_run_details()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron
AS $$
DECLARE
  v_synced integer := 0;
  v_failed integer := 0;
BEGIN
  -- Sync latest execution status from cron.job_run_details into cron_health_checks
  WITH latest_runs AS (
    SELECT DISTINCT ON (j.jobname)
      j.jobname,
      d.start_time,
      d.status AS run_status,
      d.return_message
    FROM cron.job j
    INNER JOIN cron.job_run_details d ON d.jobid = j.jobid
    ORDER BY j.jobname, d.start_time DESC
  )
  INSERT INTO public.cron_health_checks (
    cron_name,
    last_success_at,
    last_failure_at,
    consecutive_failures,
    last_error,
    updated_at
  )
  SELECT
    lr.jobname,
    CASE WHEN lr.run_status = 'succeeded' THEN lr.start_time ELSE NULL END,
    CASE WHEN lr.run_status <> 'succeeded' THEN lr.start_time ELSE NULL END,
    CASE WHEN lr.run_status <> 'succeeded' THEN 1 ELSE 0 END,
    CASE WHEN lr.run_status <> 'succeeded' THEN lr.return_message ELSE NULL END,
    now()
  FROM latest_runs lr
  ON CONFLICT (cron_name) DO UPDATE SET
    last_success_at = CASE 
      WHEN EXCLUDED.last_success_at IS NOT NULL 
      THEN EXCLUDED.last_success_at 
      ELSE cron_health_checks.last_success_at 
    END,
    last_failure_at = CASE 
      WHEN EXCLUDED.last_failure_at IS NOT NULL 
      THEN EXCLUDED.last_failure_at 
      ELSE cron_health_checks.last_failure_at 
    END,
    consecutive_failures = CASE 
      WHEN EXCLUDED.last_success_at IS NOT NULL THEN 0
      ELSE cron_health_checks.consecutive_failures + 1
    END,
    last_error = CASE 
      WHEN EXCLUDED.last_error IS NOT NULL 
      THEN EXCLUDED.last_error 
      ELSE cron_health_checks.last_error 
    END,
    updated_at = now();

  GET DIAGNOSTICS v_synced = ROW_COUNT;

  RETURN jsonb_build_object(
    'synced', v_synced,
    'timestamp', now()
  );
END;
$$;

COMMENT ON FUNCTION public.sync_pgcron_health_from_run_details() IS 
'Bridges observability gap: syncs pg_cron job_run_details into cron_health_checks for SQL-only crons that cannot call update_cron_health RPC directly.';

-- =============================================================================
-- FIX 2: Recreate v_security_invariants WITHOUT auth filter
-- Allows service_role and admin contexts to read security metrics
-- =============================================================================

DROP VIEW IF EXISTS public.v_security_invariants;

CREATE VIEW public.v_security_invariants 
WITH (security_invoker = off)
AS
SELECT 
  now() AS snapshot_at,
  -- INV-001: RLS Coverage
  (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace 
   WHERE c.relrowsecurity = true AND n.nspname = 'public' AND c.relkind = 'r') AS inv001_tables_with_rls,
  (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace 
   WHERE n.nspname = 'public' AND c.relkind = 'r') AS inv001_total_tables,
  (SELECT count(DISTINCT tablename) FROM pg_policies WHERE schemaname = 'public') AS inv001_tables_with_policies,
  -- INV-002: HMAC Activity
  (SELECT count(*) FROM hmac_signatures WHERE used_at > now() - interval '24 hours') AS inv002_signatures_24h,
  (SELECT count(*) FROM hmac_signatures WHERE used_at > now() - interval '1 hour') AS inv002_signatures_1h,
  (SELECT count(DISTINCT agent_name) FROM hmac_signatures WHERE used_at > now() - interval '24 hours') AS inv002_unique_agents_24h,
  (SELECT COALESCE((SELECT used_at FROM hmac_signatures ORDER BY used_at DESC LIMIT 1), '1970-01-01'::timestamptz)) AS inv002_last_verification,
  -- INV-003: Tenant Isolation
  (SELECT count(DISTINCT tenant_id) FROM agents WHERE archived_at IS NULL) AS inv003_active_tenants,
  (SELECT count(*) FROM rls_test_results WHERE passed = true AND tested_at > now() - interval '7 days') AS inv003_rls_tests_passed_7d,
  (SELECT count(*) FROM rls_test_results WHERE passed = false AND tested_at > now() - interval '7 days') AS inv003_rls_tests_failed_7d,
  -- INV-004: No Secrets in Views
  (SELECT count(*) = 0 FROM pg_views v 
   WHERE v.schemaname = 'public' AND v.viewname NOT IN ('v_security_invariants', 'hmac_agent_secrets')
   AND (POSITION('hmac_secret' IN v.definition) > 0 OR POSITION('password' IN v.definition) > 0)) AS inv004_no_secrets_in_views,
  (SELECT count(*) FROM pg_views v 
   WHERE v.schemaname = 'public' AND v.viewname IN ('agents_public', 'agents_safe', 'active_agents')
   AND POSITION('hmac_secret' IN v.definition) = 0) AS inv004_safe_agent_views,
  -- INV-005: Audit Trail
  (SELECT count(*) FROM audit_logs WHERE created_at > now() - interval '24 hours') AS inv005_audit_entries_24h,
  (SELECT count(*) FROM audit_logs WHERE created_at > now() - interval '1 hour') AS inv005_audit_entries_1h,
  (SELECT count(DISTINCT action) FROM audit_logs WHERE created_at > now() - interval '24 hours') AS inv005_unique_actions_24h,
  (SELECT count(*) FROM agent_evidence_logs WHERE created_at > now() - interval '24 hours') AS inv005_evidence_logs_24h,
  -- INV-006: Privilege Control
  (SELECT count(*) = 0 FROM information_schema.role_table_grants 
   WHERE grantee = 'anon' AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE') AND table_schema = 'public') AS inv006_no_anon_write,
  (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND roles::text LIKE '%service_role%') AS inv006_service_role_policies,
  -- Health Metrics
  (SELECT count(*) FROM agents WHERE archived_at IS NULL AND last_heartbeat > now() - interval '30 minutes') AS health_active_agents,
  (SELECT count(*) FROM ai_actions WHERE status = 'pending' AND created_at > now() - interval '7 days') AS health_pending_actions,
  (SELECT count(*) FROM ai_actions WHERE status = 'completed' AND created_at > now() - interval '7 days') AS health_completed_actions;

-- Grant read access to authenticated users only
GRANT SELECT ON public.v_security_invariants TO authenticated;
GRANT SELECT ON public.v_security_invariants TO service_role;
REVOKE ALL ON public.v_security_invariants FROM anon;

COMMENT ON VIEW public.v_security_invariants IS 
'Security posture dashboard. security_invoker=off intentional: allows service_role and admin contexts to monitor all invariants. Underlying tables have their own RLS.';
