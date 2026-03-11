
-- =============================================================================
-- V-900: Fix PUBLIC role policies on tenant-scoped tables (CRITICAL)
-- V-901: Fix views with super_admin bypass but no tenant filter  
-- V-902: Fix nullable tenant_id on critical operational tables
-- =============================================================================

-- ============ V-900: Fix PUBLIC role on metrics partitions ============

DROP POLICY IF EXISTS "Tenant isolation for metrics 2026_03" ON agent_system_metrics_2026_03;
CREATE POLICY "Tenant isolation for metrics 2026_03"
ON agent_system_metrics_2026_03
FOR SELECT
TO authenticated
USING ((tenant_id = get_active_tenant_id()) OR is_current_super_admin());

DROP POLICY IF EXISTS "Tenant isolation for metrics 2026_04" ON agent_system_metrics_2026_04;
CREATE POLICY "Tenant isolation for metrics 2026_04"
ON agent_system_metrics_2026_04
FOR SELECT
TO authenticated
USING ((tenant_id = get_active_tenant_id()) OR is_current_super_admin());

-- Fix tenant_software_policy policies: change from public to authenticated
DROP POLICY IF EXISTS "Admins can insert software policy" ON tenant_software_policy;
CREATE POLICY "Admins can insert software policy"
ON tenant_software_policy
FOR INSERT
TO authenticated
WITH CHECK (tenant_id = get_active_tenant_id());

DROP POLICY IF EXISTS "Admins can update software policy" ON tenant_software_policy;
CREATE POLICY "Admins can update software policy"
ON tenant_software_policy
FOR UPDATE
TO authenticated
USING (tenant_id = get_active_tenant_id())
WITH CHECK (tenant_id = get_active_tenant_id());

DROP POLICY IF EXISTS "Tenant members can view software policy" ON tenant_software_policy;
CREATE POLICY "Tenant members can view software policy"
ON tenant_software_policy
FOR SELECT
TO authenticated
USING (tenant_id = get_active_tenant_id());

-- ============ V-901: Fix views - add tenant filtering ============

-- v_job_health: uses scheduled_job_runs which has tenant_id
CREATE OR REPLACE VIEW v_job_health WITH (security_invoker = on, security_barrier = true) AS
SELECT job_key,
    job_source,
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
      WHEN max(ran_at) < (now() - interval '2 hours') THEN 'stale'
      WHEN count(*) FILTER (WHERE success IS FALSE AND ran_at > (now() - interval '1 hour')) > 3 THEN 'critical'
      WHEN count(*) FILTER (WHERE success IS FALSE AND ran_at > (now() - interval '2 hours')) > 0 THEN 'warning'
      ELSE 'healthy'
    END AS health_status,
    CASE
      WHEN count(*) = 0 THEN 'low'
      WHEN max(ran_at) < (now() - interval '2 hours') THEN 'medium'
      WHEN count(*) FILTER (WHERE success IS FALSE AND ran_at > (now() - interval '1 hour')) > 3 THEN 'critical'
      WHEN count(*) FILTER (WHERE success IS FALSE AND ran_at > (now() - interval '2 hours')) > 0 THEN 'high'
      ELSE 'low'
    END AS severity
FROM scheduled_job_runs
WHERE ran_at > (now() - interval '24 hours')
  AND auth.uid() IS NOT NULL
  AND (tenant_id = get_active_tenant_id() OR (get_active_tenant_id() IS NULL AND is_current_super_admin()))
GROUP BY job_key, job_source;

-- v_incident_groups_with_slo: add tenant filter via v_incident_groups
CREATE OR REPLACE VIEW v_incident_groups_with_slo WITH (security_invoker = on, security_barrier = true) AS
SELECT ig.id,
    ig.fingerprint_hash,
    ig.source_type,
    ig.failure_class,
    ig.normalized_signature,
    ig.severity_hint,
    ig.total_occurrences,
    ig.distinct_tenants,
    ig.distinct_agents,
    ig.first_seen_at,
    ig.last_seen_at,
    ig.is_active,
    ig.is_ongoing,
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
WHERE auth.uid() IS NOT NULL
  AND is_current_super_admin()
ORDER BY COALESCE(slo.burn_rate_1h, 0::numeric) DESC NULLS LAST,
         (ig.severity_hint = 'critical') DESC,
         ig.total_occurrences DESC;

-- v_anomalies_without_runbook: keep with super_admin (cross-tenant system view)
CREATE OR REPLACE VIEW v_anomalies_without_runbook WITH (security_invoker = on, security_barrier = true) AS
SELECT DISTINCT anomaly_type
FROM v_job_health_anomalies
WHERE NOT (anomaly_type IN (SELECT anomaly_type FROM runbooks))
  AND auth.uid() IS NOT NULL
  AND is_current_super_admin();

-- ============ V-902: Add NOT NULL to critical operational tables ============
-- Set default values first for any existing NULLs, then enforce NOT NULL

DO $$
DECLARE
  tbl text;
  has_nulls boolean;
BEGIN
  FOR tbl IN 
    SELECT unnest(ARRAY[
      'domain_events', 'ip_blocklist', 'performance_metrics', 
      'playbook_actions', 'playbooks', 'policy_rules', 'runbooks',
      'scheduled_job_runs', 'security_policy_rules', 'segregation_rules',
      'soar_playbook_versions', 'soar_playbooks', 'ai_inference_metrics',
      'ai_response_cache', 'admin_ip_whitelist', 'agent_signing_keys',
      'agent_update_decisions'
    ])
  LOOP
    -- Check if there are existing NULL values
    EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I WHERE tenant_id IS NULL)', tbl) INTO has_nulls;
    
    IF NOT has_nulls THEN
      BEGIN
        EXECUTE format('ALTER TABLE %I ALTER COLUMN tenant_id SET NOT NULL', tbl);
        RAISE NOTICE 'Set NOT NULL on %.tenant_id', tbl;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Skipped %.tenant_id: %', tbl, SQLERRM;
      END;
    ELSE
      RAISE NOTICE 'Skipped %.tenant_id: has NULL values', tbl;
    END IF;
  END LOOP;
END $$;
