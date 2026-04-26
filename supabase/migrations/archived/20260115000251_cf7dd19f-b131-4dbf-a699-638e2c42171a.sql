-- =============================================================================
-- Migration: Security Fixes for Views (ADR-FINAL-SECURITY-003)
-- Date: 2026-01-15
-- Scope: Fix 2 view vulnerabilities (profiles_public, v_agent_health_by_node)
-- Note: hmac_agent_secrets is already protected (view with is_current_super_admin())
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Fix profiles_public view for cross-tenant isolation
-- Problem: View potentially leaked profiles across tenants
-- Solution: Recreate with strict tenant filtering
-- -----------------------------------------------------------------------------

DROP VIEW IF EXISTS profiles_public;

CREATE VIEW profiles_public 
WITH (security_invoker = true) AS
SELECT
  p.id,
  p.user_id,
  p.full_name,
  p.username
FROM profiles p
WHERE EXISTS (
  -- Only show profiles from same tenant(s) as current user
  SELECT 1 FROM user_roles ur1
  WHERE ur1.user_id = p.user_id
  AND ur1.tenant_id IN (
    SELECT ur2.tenant_id 
    FROM user_roles ur2 
    WHERE ur2.user_id = auth.uid()
  )
);

GRANT SELECT ON profiles_public TO authenticated;

COMMENT ON VIEW profiles_public IS 
'ADR-SECURITY-003: Safe view exposing minimal profile data with tenant isolation.';

-- -----------------------------------------------------------------------------
-- 2. Filter v_agent_health_by_node by tenant
-- Problem: View exposed agent metrics from all tenants
-- Solution: Recreate with tenant filter
-- -----------------------------------------------------------------------------

DROP VIEW IF EXISTS v_agent_health_by_node;

CREATE VIEW v_agent_health_by_node 
WITH (security_invoker = true) AS
SELECT 
  a.id,
  a.agent_name,
  a.hostname,
  a.status,
  a.tenant_id,
  a.last_heartbeat,
  CASE
    WHEN a.status IN ('offline', 'inactive') THEN 'critical'
    WHEN a.last_heartbeat IS NULL THEN 'warning'
    WHEN a.last_heartbeat < (now() - interval '30 minutes') THEN 'critical'
    WHEN a.last_heartbeat < (now() - interval '15 minutes') THEN 'warning'
    ELSE 'healthy'
  END AS health_status,
  EXTRACT(epoch FROM (now() - a.last_heartbeat)) / 60 AS minutes_since_heartbeat,
  (
    SELECT COUNT(*) 
    FROM agent_safe_mode_events sme 
    WHERE sme.agent_id = a.id 
    AND sme.resolved_at IS NULL
  ) AS active_safe_mode_events,
  (
    SELECT COUNT(*) 
    FROM agent_rollback_events re 
    WHERE re.agent_id = a.id 
    AND re.created_at > (now() - interval '24 hours')
  ) AS recent_rollbacks
FROM agents a
WHERE a.status <> 'archived'
  AND (
    -- Tenant isolation: only show agents from user's tenant(s)
    a.tenant_id IN (SELECT tenant_id FROM user_roles WHERE user_id = auth.uid())
    OR is_current_super_admin()
  );

GRANT SELECT ON v_agent_health_by_node TO authenticated;

COMMENT ON VIEW v_agent_health_by_node IS 
'ADR-SECURITY-003: Agent health metrics with tenant isolation. Super admins see all.';