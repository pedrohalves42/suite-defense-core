-- =============================================================================
-- ADR-FINAL-SECURITY-002: Final Security Hardening
-- =============================================================================
-- Purpose: Close remaining security findings for compliance_policies and profiles
-- Date: 2026-01-15
-- =============================================================================

-- =============================================================================
-- PHASE 1: Harden compliance_policies - restrict write to super_admin
-- =============================================================================

-- Drop permissive write policies
DROP POLICY IF EXISTS compliance_policies_insert_active_tenant ON compliance_policies;
DROP POLICY IF EXISTS compliance_policies_update_active_tenant ON compliance_policies;
DROP POLICY IF EXISTS compliance_policies_delete_active_tenant ON compliance_policies;

-- Create restricted write policy for super_admin
CREATE POLICY compliance_policies_write_super_admin
ON compliance_policies
FOR ALL
USING (is_current_super_admin())
WITH CHECK (is_current_super_admin());

-- Service role maintains full access
DROP POLICY IF EXISTS compliance_policies_service_role ON compliance_policies;
CREATE POLICY compliance_policies_service_role
ON compliance_policies
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- =============================================================================
-- PHASE 2: Create profiles_public view for safe profile listing
-- =============================================================================

-- Drop existing view if any
DROP VIEW IF EXISTS profiles_public;

-- Create secure view exposing only necessary fields
CREATE VIEW profiles_public WITH (security_invoker = true) AS
SELECT
  p.id,
  p.user_id,
  p.full_name,
  p.username
FROM profiles p
WHERE p.user_id IN (
  SELECT ur.user_id
  FROM user_roles ur
  WHERE ur.tenant_id IN (
    SELECT tenant_id FROM user_roles WHERE user_id = auth.uid()
  )
);

-- Grant appropriate permissions
GRANT SELECT ON profiles_public TO authenticated;
GRANT ALL ON profiles TO service_role;

-- Add documentation
COMMENT ON VIEW profiles_public IS 'ADR-FINAL-002: Safe view for profile listing within same tenant, excludes timestamps and sensitive data';

-- =============================================================================
-- PHASE 3: Update CI test to include new view
-- =============================================================================

-- Add profiles_public to the list of views that must have auth check
COMMENT ON VIEW profiles_public IS 'ADR-FINAL-002: Safe view - security_invoker=true ensures auth.uid() check';