-- =============================================================================
-- ADR-023 PHASE 2-5: SECURITY HARDENING MIGRATION (FINAL)
-- Master Correction Plan - Principal Systems Integrity Architect
-- =============================================================================

-- =============================================================================
-- PHASE 2: RLS HARDENING - SENSITIVE DATA
-- =============================================================================

-- 2A: Restrict failure_fingerprints (exposes attack patterns)
DROP POLICY IF EXISTS "fingerprints_read_all" ON public.failure_fingerprints;
CREATE POLICY "authenticated_read_fingerprints" ON public.failure_fingerprints
  FOR SELECT TO authenticated
  USING (true);

-- 2B: Restrict incident_slo_state (CRITICAL - was allowing public writes)
DROP POLICY IF EXISTS "incident_slo_service_write" ON public.incident_slo_state;
CREATE POLICY "service_role_only_incident_slo" ON public.incident_slo_state
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_read_incident_slo" ON public.incident_slo_state
  FOR SELECT TO authenticated
  USING (true);

-- 2C: Restrict system_liveness
DROP POLICY IF EXISTS "Anyone can view system liveness" ON public.system_liveness;
CREATE POLICY "authenticated_read_liveness" ON public.system_liveness
  FOR SELECT TO authenticated
  USING (true);

-- 2D: Restrict system_state
DROP POLICY IF EXISTS "Anyone can read system state" ON public.system_state;
CREATE POLICY "authenticated_read_system_state" ON public.system_state
  FOR SELECT TO authenticated
  USING (true);

-- =============================================================================
-- PHASE 3: HARDENING CRITICAL VIEWS
-- Ensure all critical views use security_invoker = true
-- =============================================================================

-- Critical security views
ALTER VIEW IF EXISTS public.hmac_agent_secrets SET (security_invoker = true);
ALTER VIEW IF EXISTS public.active_agents SET (security_invoker = true);
ALTER VIEW IF EXISTS public.agents_public SET (security_invoker = true);
ALTER VIEW IF EXISTS public.agents_safe SET (security_invoker = true);

-- Circuit breaker and DLQ views
ALTER VIEW IF EXISTS public.circuit_breaker_health SET (security_invoker = true);
ALTER VIEW IF EXISTS public.dlq_categorized SET (security_invoker = true);
ALTER VIEW IF EXISTS public.dlq_risk_overview SET (security_invoker = true);
ALTER VIEW IF EXISTS public.dlq_volume_by_hour SET (security_invoker = true);

-- Governance and metrics views
ALTER VIEW IF EXISTS public.governance_health_metrics SET (security_invoker = true);
ALTER VIEW IF EXISTS public.v_agent_health_summary SET (security_invoker = true);
ALTER VIEW IF EXISTS public.v_agent_health_by_node SET (security_invoker = true);
ALTER VIEW IF EXISTS public.v_agent_execution_health SET (security_invoker = true);
ALTER VIEW IF EXISTS public.v_agent_lifecycle_state SET (security_invoker = true);
ALTER VIEW IF EXISTS public.v_problematic_agents SET (security_invoker = true);

-- Job and operations views
ALTER VIEW IF EXISTS public.v_job_metrics_by_type SET (security_invoker = true);
ALTER VIEW IF EXISTS public.v_system_operations_summary SET (security_invoker = true);
ALTER VIEW IF EXISTS public.v_tenant_plan_status SET (security_invoker = true);

-- Installation and health views
ALTER VIEW IF EXISTS public.installation_health_status SET (security_invoker = true);
ALTER VIEW IF EXISTS public.enrollment_keys_safe SET (security_invoker = true);
ALTER VIEW IF EXISTS public.invites_safe SET (security_invoker = true);

-- =============================================================================
-- PHASE 5: SECURITY INVARIANTS VIEW
-- Monitor for security regressions (corrected table/column names)
-- =============================================================================

CREATE OR REPLACE VIEW public.v_security_invariants AS
-- Check for dangerous public policies
SELECT
  'PUBLIC_WRITE_POLICIES' as invariant_type,
  COUNT(*) as violation_count,
  CASE WHEN COUNT(*) > 0 THEN 'CRITICAL' ELSE 'OK' END as status,
  'Public role has write policies with USING(true)' as description
FROM pg_policies
WHERE schemaname = 'public'
AND roles::text LIKE '%public%'
AND (qual::text = 'true' OR with_check::text = 'true')
AND cmd IN ('UPDATE', 'DELETE', 'INSERT', 'ALL')

UNION ALL

-- Check for scheduled jobs without recent executions
SELECT
  'SCHEDULED_JOBS_NO_RUNS' as invariant_type,
  COUNT(*) as violation_count,
  CASE 
    WHEN COUNT(*) > 10 THEN 'CRITICAL'
    WHEN COUNT(*) > 5 THEN 'HIGH' 
    ELSE 'OK' 
  END as status,
  'Enabled jobs with no runs in 24h' as description
FROM scheduled_jobs sj
WHERE sj.enabled = true
AND NOT EXISTS (
  SELECT 1 FROM scheduled_job_runs sjr 
  WHERE sjr.job_key = sj.name 
  AND sjr.ran_at > NOW() - INTERVAL '24 hours'
)

UNION ALL

-- Check for failed jobs in DLQ (correct table: failed_jobs_dlq)
SELECT
  'DLQ_CRITICAL_JOBS' as invariant_type,
  COUNT(*) as violation_count,
  CASE 
    WHEN COUNT(*) > 50 THEN 'CRITICAL'
    WHEN COUNT(*) > 20 THEN 'HIGH' 
    ELSE 'OK' 
  END as status,
  'Jobs in dead letter queue' as description
FROM failed_jobs_dlq
WHERE created_at > NOW() - INTERVAL '24 hours';

-- Grant access to security invariants view
GRANT SELECT ON public.v_security_invariants TO authenticated;
GRANT SELECT ON public.v_security_invariants TO service_role;

-- =============================================================================
-- VALIDATION: Ensure no dangerous policies remain
-- =============================================================================

DO $$
DECLARE
  dangerous_count integer;
BEGIN
  SELECT COUNT(*) INTO dangerous_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND roles::text LIKE '%public%'
    AND cmd IN ('UPDATE', 'DELETE', 'INSERT', 'ALL')
    AND (qual::text = 'true' OR with_check::text = 'true');
  
  IF dangerous_count > 0 THEN
    RAISE WARNING 'Found % dangerous public write policies - review manually', dangerous_count;
  ELSE
    RAISE NOTICE 'SECURITY VALIDATION PASSED: No dangerous public write policies found';
  END IF;
END $$;