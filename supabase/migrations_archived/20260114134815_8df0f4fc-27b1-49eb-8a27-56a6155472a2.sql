-- =============================================================================
-- RLS Hardening Phase 9: Final View Security Corrections
-- ADR-024 Completion
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Phase 9.1: Metrics Views with Tenant + Super Admin Filtering
-- -----------------------------------------------------------------------------

-- v_rbac_metrics: Add tenant filtering
DROP VIEW IF EXISTS public.v_rbac_metrics;
CREATE OR REPLACE VIEW public.v_rbac_metrics
WITH (security_invoker = true) AS
SELECT 
  ur.tenant_id,
  count(DISTINCT ur.user_id) AS total_users,
  count(DISTINCT ur.user_id) FILTER (WHERE ur.role::text = 'admin') AS admin_count,
  count(DISTINCT ur.user_id) FILTER (WHERE ur.role::text = 'analyst') AS analyst_count,
  count(DISTINCT ur.user_id) FILTER (WHERE ur.role::text = 'viewer') AS viewer_count
FROM public.user_roles ur
WHERE (
  ur.tenant_id IN (SELECT ur2.tenant_id FROM public.user_roles ur2 WHERE ur2.user_id = auth.uid())
  OR public.is_current_super_admin()
)
GROUP BY ur.tenant_id;

-- v_governance_stats: Add tenant filtering (using correct columns: severity instead of priority)
DROP VIEW IF EXISTS public.v_governance_stats;
CREATE OR REPLACE VIEW public.v_governance_stats
WITH (security_invoker = true) AS
SELECT 
  t.tenant_id,
  count(*) FILTER (WHERE t.status IN ('open', 'in_progress')) AS active_tasks,
  count(*) FILTER (WHERE t.status = 'closed') AS completed_tasks,
  count(*) FILTER (WHERE t.severity = 'critical' AND t.status != 'closed') AS critical_open,
  count(*) AS total_tasks
FROM public.tasks t
WHERE (
  t.tenant_id IN (SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid())
  OR public.is_current_super_admin()
)
GROUP BY t.tenant_id;

-- v_soc2_readiness: Add tenant filtering (using correct columns from soc2_controls)
DROP VIEW IF EXISTS public.v_soc2_readiness;
CREATE OR REPLACE VIEW public.v_soc2_readiness
WITH (security_invoker = true) AS
SELECT 
  sc.tenant_id,
  sc.control_code,
  sc.control_name,
  sc.description,
  sc.status,
  sc.evidence_type,
  sc.evidence_ref,
  sc.gap_notes,
  sc.remediation_plan,
  sc.owner,
  sc.due_date,
  sc.verified_at,
  sc.verified_by
FROM public.soc2_controls sc
WHERE (
  sc.tenant_id IN (SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid())
  OR public.is_current_super_admin()
);

-- v_job_hourly_trends: Add tenant filtering
DROP VIEW IF EXISTS public.v_job_hourly_trends;
CREATE OR REPLACE VIEW public.v_job_hourly_trends
WITH (security_invoker = true) AS
SELECT 
  j.tenant_id,
  date_trunc('hour', j.created_at) AS hour,
  count(*) AS total,
  count(*) FILTER (WHERE j.status = 'completed') AS completed,
  count(*) FILTER (WHERE j.status = 'failed') AS failed,
  round(count(*) FILTER (WHERE j.status = 'completed')::numeric / NULLIF(count(*), 0)::numeric * 100, 1) AS success_rate_pct
FROM public.jobs j
WHERE j.created_at > (now() - interval '24 hours')
  AND (
    j.tenant_id IN (SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid())
    OR public.is_current_super_admin()
  )
GROUP BY j.tenant_id, date_trunc('hour', j.created_at)
ORDER BY date_trunc('hour', j.created_at) DESC;

-- -----------------------------------------------------------------------------
-- Phase 9.2: Security Views - Super Admin Only
-- -----------------------------------------------------------------------------

-- v_rls_security_status: Super admin only (using correct columns from rls_test_results)
DROP VIEW IF EXISTS public.v_rls_security_status;
CREATE OR REPLACE VIEW public.v_rls_security_status
WITH (security_invoker = true) AS
SELECT 
  rt.id,
  rt.test_run_id,
  rt.test_name,
  rt.table_name,
  rt.passed,
  rt.failure_reason,
  rt.tested_at,
  rt.details
FROM public.rls_test_results rt
WHERE public.is_current_super_admin();

-- v_security_invariants: Super admin only (system metadata)
DROP VIEW IF EXISTS public.v_security_invariants;
CREATE OR REPLACE VIEW public.v_security_invariants
WITH (security_invoker = true) AS
SELECT
  'rls_enabled' AS invariant_type,
  c.relname AS object_name,
  CASE WHEN c.relrowsecurity THEN 'pass' ELSE 'violation' END AS status,
  'All public tables must have RLS enabled' AS description
FROM pg_class c
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND public.is_current_super_admin()
UNION ALL
SELECT
  'policy_exists' AS invariant_type,
  c.relname AS object_name,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_policies p WHERE p.tablename = c.relname AND p.schemaname = 'public'
  ) THEN 'pass' ELSE 'violation' END AS status,
  'All public tables must have at least one RLS policy' AS description
FROM pg_class c
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relrowsecurity = true
  AND public.is_current_super_admin();

-- v_integrity_score: Super admin only (global metrics)
DROP VIEW IF EXISTS public.v_integrity_score;
CREATE OR REPLACE VIEW public.v_integrity_score
WITH (security_invoker = true) AS
SELECT
  'supply_chain_integrity' AS metric_type,
  count(*) FILTER (WHERE ar.signature_base64 IS NOT NULL)::numeric / NULLIF(count(*), 0)::numeric * 100 AS score,
  count(*) AS total_releases,
  count(*) FILTER (WHERE ar.signature_base64 IS NOT NULL) AS signed_releases,
  now() AS calculated_at
FROM public.agent_releases ar
WHERE public.is_current_super_admin()
UNION ALL
SELECT
  'rls_coverage' AS metric_type,
  count(*) FILTER (WHERE c.relrowsecurity = true)::numeric / NULLIF(count(*), 0)::numeric * 100 AS score,
  count(*) AS total_tables,
  count(*) FILTER (WHERE c.relrowsecurity = true) AS rls_enabled_tables,
  now() AS calculated_at
FROM pg_class c
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND public.is_current_super_admin();

-- -----------------------------------------------------------------------------
-- Phase 9.3: Verification Comments
-- -----------------------------------------------------------------------------
COMMENT ON VIEW public.v_rbac_metrics IS 'RBAC metrics per tenant - filtered by tenant membership or super_admin (ADR-024 Phase 9)';
COMMENT ON VIEW public.v_governance_stats IS 'Governance task statistics - filtered by tenant membership or super_admin (ADR-024 Phase 9)';
COMMENT ON VIEW public.v_soc2_readiness IS 'SOC2 compliance readiness - filtered by tenant membership or super_admin (ADR-024 Phase 9)';
COMMENT ON VIEW public.v_job_hourly_trends IS 'Job execution trends - filtered by tenant membership or super_admin (ADR-024 Phase 9)';
COMMENT ON VIEW public.v_rls_security_status IS 'RLS test results - super_admin only (ADR-024 Phase 9)';
COMMENT ON VIEW public.v_security_invariants IS 'Security invariant checks - super_admin only (ADR-024 Phase 9)';
COMMENT ON VIEW public.v_integrity_score IS 'System integrity metrics - super_admin only (ADR-024 Phase 9)';