-- =============================================================================
-- Migration: Final Security Hardening - Views Cross-Tenant Fix
-- Date: 2026-01-15
-- Scope: Fix 4 remaining view vulnerabilities
-- Reference: ADR-FINAL-SECURITY-003
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. CRITICAL: enrollment_keys_safe - Fix cross-tenant exposure
-- -----------------------------------------------------------------------------

DROP VIEW IF EXISTS enrollment_keys_safe;

CREATE VIEW enrollment_keys_safe 
WITH (security_invoker = true) AS
SELECT
  ek.id,
  ek.tenant_id,
  ek.key,
  ek.description,
  ek.max_uses,
  ek.current_uses,
  ek.is_active,
  ek.created_at,
  ek.expires_at,
  ek.created_by
FROM enrollment_keys ek
WHERE
  ek.tenant_id IN (
    SELECT tenant_id FROM user_roles WHERE user_id = auth.uid()
  )
  OR is_current_super_admin();

GRANT SELECT ON enrollment_keys_safe TO authenticated, service_role;

COMMENT ON VIEW enrollment_keys_safe IS 
'ADR-FINAL-SECURITY-003: Tenant-isolated enrollment keys view.';

-- -----------------------------------------------------------------------------
-- 2. CRITICAL: invites_safe - Fix cross-tenant exposure
-- -----------------------------------------------------------------------------

DROP VIEW IF EXISTS invites_safe;

CREATE VIEW invites_safe 
WITH (security_invoker = true) AS
SELECT
  i.id,
  i.tenant_id,
  i.email,
  i.role,
  i.status,
  i.invited_by,
  i.created_at,
  i.expires_at,
  i.accepted_at
FROM invites i
WHERE
  i.tenant_id IN (
    SELECT tenant_id FROM user_roles WHERE user_id = auth.uid()
  )
  OR is_current_super_admin();

GRANT SELECT ON invites_safe TO authenticated, service_role;

COMMENT ON VIEW invites_safe IS 
'ADR-FINAL-SECURITY-003: Tenant-isolated invites view.';

-- -----------------------------------------------------------------------------
-- 3. HIGH: v_job_health - Restrict to super_admin only
-- -----------------------------------------------------------------------------

DROP VIEW IF EXISTS v_job_health;

CREATE VIEW v_job_health 
WITH (security_invoker = true) AS
SELECT
  sjr.job_key,
  sjr.job_source,
  COUNT(*) AS total_runs,
  COUNT(*) FILTER (WHERE sjr.success IS TRUE) AS successful_runs,
  COUNT(*) FILTER (WHERE sjr.success IS FALSE) AS failed_runs,
  MAX(sjr.ran_at) AS last_run_at,
  AVG(sjr.duration_ms)::numeric(10,2) AS avg_duration_ms
FROM scheduled_job_runs sjr
WHERE is_current_super_admin()
GROUP BY sjr.job_key, sjr.job_source;

GRANT SELECT ON v_job_health TO authenticated, service_role;

COMMENT ON VIEW v_job_health IS 
'ADR-FINAL-SECURITY-003: Global job health metrics. Restricted to super_admin only.';

-- -----------------------------------------------------------------------------
-- 4. HIGH: v_audit_integrity_status - Fix cross-tenant exposure
-- Uses actual columns: chain_valid, breaks_detected
-- -----------------------------------------------------------------------------

DROP VIEW IF EXISTS v_audit_integrity_status;

CREATE VIEW v_audit_integrity_status 
WITH (security_invoker = true) AS
SELECT
  aic.tenant_id,
  COUNT(*) AS total_checks,
  COUNT(*) FILTER (WHERE aic.chain_valid IS TRUE) AS valid_checks,
  COUNT(*) FILTER (WHERE aic.chain_valid IS FALSE) AS failed_checks,
  SUM(aic.breaks_detected) AS total_breaks_detected,
  MAX(aic.checked_at) AS last_checked_at
FROM audit_integrity_checks aic
WHERE
  aic.tenant_id IN (
    SELECT tenant_id FROM user_roles WHERE user_id = auth.uid()
  )
  OR is_current_super_admin()
GROUP BY aic.tenant_id;

GRANT SELECT ON v_audit_integrity_status TO authenticated, service_role;

COMMENT ON VIEW v_audit_integrity_status IS 
'ADR-FINAL-SECURITY-003: Tenant-isolated audit integrity status view.';