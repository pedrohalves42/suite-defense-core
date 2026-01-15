-- =============================================================================
-- Migration: Security Hardening Final - Dr. Vellum Audit
-- ID: 20260115_security_hardening_final
-- Description: Fix all remaining cross-tenant vulnerabilities
-- =============================================================================

-- =========================================
-- PHASE 1: CRITICAL VIEWS (Cross-Tenant Fix)
-- =========================================

-- 1.1 v_incident_groups - Filter by tenant via failure_occurrences
CREATE OR REPLACE VIEW v_incident_groups 
WITH (security_invoker = on) AS
SELECT
  fp.id,
  fp.fingerprint_hash,
  fp.source_type,
  fp.failure_class,
  fp.normalized_signature,
  fp.severity_hint,
  fp.total_occurrences,
  fp.distinct_tenants,
  fp.distinct_agents,
  fp.first_seen_at,
  fp.last_seen_at,
  fp.is_active,
  fp.is_trending,
  (fp.last_seen_at > now() - interval '4 hours') AS is_ongoing,
  COALESCE(
    (SELECT COUNT(*) FROM failure_occurrences fo 
     WHERE fo.fingerprint_id = fp.id 
       AND fo.occurred_at > now() - interval '24 hours'
       AND (fo.tenant_id = get_active_tenant_id() OR is_current_super_admin())),
    0
  )::bigint AS occurrences_24h
FROM failure_fingerprints fp
WHERE fp.is_active = true
  AND (
    is_current_super_admin() 
    OR EXISTS (
      SELECT 1 FROM failure_occurrences fo 
      WHERE fo.fingerprint_id = fp.id 
        AND fo.tenant_id = get_active_tenant_id()
    )
  )
ORDER BY 
  CASE fp.severity_hint 
    WHEN 'critical' THEN 1 
    WHEN 'high' THEN 2 
    WHEN 'medium' THEN 3 
    ELSE 4 
  END,
  fp.last_seen_at DESC;

-- 1.2 v_job_health_anomalies - Add tenant filter to each UNION
CREATE OR REPLACE VIEW v_job_health_anomalies
WITH (security_invoker = on) AS
SELECT 'pending_approved'::text AS anomaly_type, count(*) AS count, min(created_at) AS oldest
FROM jobs
WHERE status = 'pending' AND approved = true
  AND (tenant_id = get_active_tenant_id() OR is_current_super_admin())
UNION ALL
SELECT 'terminal_no_completed_at'::text, count(*), min(created_at)
FROM jobs
WHERE status IN ('failed', 'completed', 'cancelled') AND completed_at IS NULL
  AND (tenant_id = get_active_tenant_id() OR is_current_super_admin())
UNION ALL
SELECT 'failed_no_dlq'::text, count(*), min(j.created_at)
FROM jobs j LEFT JOIN failed_jobs_dlq dlq ON dlq.original_job_id = j.id
WHERE j.status = 'failed' AND dlq.id IS NULL
  AND (j.tenant_id = get_active_tenant_id() OR is_current_super_admin())
UNION ALL
SELECT 'zombie_delivered'::text, count(*), min(delivered_at)
FROM jobs
WHERE status = 'delivered' AND delivered_at < now() - interval '2 hours'
  AND (tenant_id = get_active_tenant_id() OR is_current_super_admin())
UNION ALL
SELECT 'expired_active_keys'::text, count(*), min(expires_at)
FROM enrollment_keys
WHERE expires_at < now() AND is_active = true
  AND (tenant_id = get_active_tenant_id() OR is_current_super_admin())
UNION ALL
SELECT 'failed_no_execution'::text, count(*), min(j.completed_at)
FROM jobs j
WHERE j.status = 'failed' 
  AND NOT EXISTS (SELECT 1 FROM job_executions je WHERE je.job_id = j.id)
  AND j.completed_at > now() - interval '7 days'
  AND (j.tenant_id = get_active_tenant_id() OR is_current_super_admin());

-- 1.3 profiles_public - Filter via user_roles tenant
CREATE OR REPLACE VIEW profiles_public
WITH (security_invoker = on) AS
SELECT
  p.id,
  p.user_id,
  p.username,
  p.full_name,
  p.created_at
FROM profiles p
WHERE EXISTS (
  SELECT 1 FROM user_roles ur
  WHERE ur.user_id = p.user_id
    AND (ur.tenant_id = get_active_tenant_id() OR is_current_super_admin())
);

-- =========================================
-- PHASE 2: SECURITY DEFINER FUNCTIONS
-- =========================================

-- 2.1 archive_agent(uuid) - Add tenant check
CREATE OR REPLACE FUNCTION archive_agent(p_agent_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_agent RECORD;
BEGIN
  -- SECURITY: Verify agent belongs to caller's tenant (ADR-VELLUM-001)
  SELECT id, agent_name, tenant_id, status INTO v_agent
  FROM agents 
  WHERE id = p_agent_id
    AND (tenant_id = get_active_tenant_id() OR is_current_super_admin());
  
  IF v_agent.id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'AGENT_NOT_FOUND_OR_UNAUTHORIZED');
  END IF;
  
  -- Deactivate all tokens
  UPDATE agent_tokens SET is_active = false WHERE agent_id = p_agent_id;
  
  -- Archive agent
  UPDATE agents SET
    status = 'inactive',
    archived_at = NOW(),
    archived_reason = 'manual_archive',
    agent_state = 'archived',
    agent_state_changed_at = NOW(),
    agent_state_reason = 'Arquivado manualmente pelo administrador'
  WHERE id = p_agent_id;
  
  -- Clean non-auditable data
  DELETE FROM agent_disk_metrics WHERE agent_id = p_agent_id;
  DELETE FROM agent_network_info WHERE agent_id = p_agent_id;
  DELETE FROM agent_system_metrics WHERE agent_id = p_agent_id;
  DELETE FROM agent_web_activity WHERE agent_id = p_agent_id;
  DELETE FROM system_alerts WHERE agent_id = p_agent_id;
  DELETE FROM ai_insights WHERE agent_id = p_agent_id;
  
  RETURN json_build_object(
    'success', true,
    'agent_id', p_agent_id,
    'agent_name', v_agent.agent_name,
    'action', 'archived'
  );
END;
$$;

-- 2.2 archive_agent(uuid, text, text, uuid, text) - Add tenant check
CREATE OR REPLACE FUNCTION archive_agent(
  p_agent_id uuid, 
  p_reason text, 
  p_actor_type text, 
  p_actor_id uuid DEFAULT NULL, 
  p_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Validate actor_type
  IF p_actor_type NOT IN ('system', 'human') THEN
    RAISE EXCEPTION 'Invalid actor_type: %. Must be system or human', p_actor_type;
  END IF;

  -- SECURITY: Verify agent belongs to caller's tenant (ADR-VELLUM-001)
  IF NOT EXISTS (
    SELECT 1 FROM agents
    WHERE id = p_agent_id
      AND (tenant_id = get_active_tenant_id() OR is_current_super_admin())
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Agent % does not belong to your tenant', p_agent_id;
  END IF;

  -- Update the agent to archived
  UPDATE agents
  SET archived_at = now(), archived_reason = p_reason
  WHERE id = p_agent_id AND archived_at IS NULL;

  -- Log the archive event
  INSERT INTO agent_archive_events (agent_id, reason, actor_type, actor_id, notes)
  VALUES (p_agent_id, p_reason, p_actor_type, p_actor_id, p_notes);
END;
$$;

-- =========================================
-- PHASE 3: RLS HARDENING
-- =========================================

-- 3.1 AGENTS: Migrate INSERT/UPDATE/DELETE from public to authenticated
DROP POLICY IF EXISTS agents_insert_active_tenant ON agents;
DROP POLICY IF EXISTS agents_update_active_tenant ON agents;
DROP POLICY IF EXISTS agents_delete_active_tenant ON agents;

CREATE POLICY agents_insert_active_tenant ON agents
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_active_tenant_id() OR is_current_super_admin());

CREATE POLICY agents_update_active_tenant ON agents
  FOR UPDATE TO authenticated
  USING (tenant_id = get_active_tenant_id() OR is_current_super_admin())
  WITH CHECK (tenant_id = get_active_tenant_id() OR is_current_super_admin());

CREATE POLICY agents_delete_active_tenant ON agents
  FOR DELETE TO authenticated
  USING (is_current_super_admin());

-- 3.2 ENROLLMENT_KEYS: Migrate INSERT/UPDATE/DELETE from public to authenticated
DROP POLICY IF EXISTS enrollment_keys_insert_active_tenant ON enrollment_keys;
DROP POLICY IF EXISTS enrollment_keys_update_active_tenant ON enrollment_keys;
DROP POLICY IF EXISTS enrollment_keys_delete_active_tenant ON enrollment_keys;

CREATE POLICY enrollment_keys_insert_active_tenant ON enrollment_keys
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_active_tenant_id() OR is_current_super_admin());

CREATE POLICY enrollment_keys_update_active_tenant ON enrollment_keys
  FOR UPDATE TO authenticated
  USING (tenant_id = get_active_tenant_id() OR is_current_super_admin())
  WITH CHECK (tenant_id = get_active_tenant_id() OR is_current_super_admin());

CREATE POLICY enrollment_keys_delete_active_tenant ON enrollment_keys
  FOR DELETE TO authenticated
  USING (is_current_super_admin());

-- 3.3 VULN_FINDINGS: Add missing INSERT/UPDATE/DELETE policies
DROP POLICY IF EXISTS vuln_findings_insert_active_tenant ON vuln_findings;
DROP POLICY IF EXISTS vuln_findings_update_active_tenant ON vuln_findings;
DROP POLICY IF EXISTS vuln_findings_delete_active_tenant ON vuln_findings;

CREATE POLICY vuln_findings_insert_active_tenant ON vuln_findings
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_active_tenant_id() OR is_current_super_admin());

CREATE POLICY vuln_findings_update_active_tenant ON vuln_findings
  FOR UPDATE TO authenticated
  USING (tenant_id = get_active_tenant_id() OR is_current_super_admin())
  WITH CHECK (tenant_id = get_active_tenant_id() OR is_current_super_admin());

CREATE POLICY vuln_findings_delete_active_tenant ON vuln_findings
  FOR DELETE TO authenticated
  USING (is_current_super_admin());

-- =========================================
-- PHASE 4: Update CI validation tests
-- =========================================

-- Add profiles_public to the view auth check list
COMMENT ON VIEW profiles_public IS 'ADR-VELLUM-001: Tenant-isolated view of profiles via user_roles';