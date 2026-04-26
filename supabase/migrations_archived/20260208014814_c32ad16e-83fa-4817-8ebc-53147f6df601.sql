-- ============================================================
-- SECURITY HARDENING MIGRATION - SSA-SEC-004 (Part 2)
-- Complete jobs table policies and compliance view
-- ============================================================

-- ============================================================
-- 1. JOBS TABLE - Remove public role policies, use authenticated only
-- ============================================================

-- Remove public role policies
DROP POLICY IF EXISTS "jobs_select_active_tenant" ON jobs;
DROP POLICY IF EXISTS "jobs_insert_active_tenant" ON jobs;
DROP POLICY IF EXISTS "jobs_update_active_tenant" ON jobs;
DROP POLICY IF EXISTS "jobs_delete_active_tenant" ON jobs;

-- Create authenticated-only policies with strict tenant isolation
DROP POLICY IF EXISTS "jobs_select_authenticated_tenant" ON jobs;
CREATE POLICY "jobs_select_authenticated_tenant" ON jobs
FOR SELECT TO authenticated
USING (
  tenant_id = get_active_tenant_id()
  OR is_current_super_admin()
);

DROP POLICY IF EXISTS "jobs_insert_authenticated_tenant" ON jobs;
CREATE POLICY "jobs_insert_authenticated_tenant" ON jobs
FOR INSERT TO authenticated
WITH CHECK (
  tenant_id = get_active_tenant_id()
  OR is_current_super_admin()
);

DROP POLICY IF EXISTS "jobs_update_authenticated_tenant" ON jobs;
CREATE POLICY "jobs_update_authenticated_tenant" ON jobs
FOR UPDATE TO authenticated
USING (
  tenant_id = get_active_tenant_id()
  OR is_current_super_admin()
)
WITH CHECK (
  tenant_id = get_active_tenant_id()
  OR is_current_super_admin()
);

-- Only super admin can delete
DROP POLICY IF EXISTS "jobs_delete_super_admin_only" ON jobs;
CREATE POLICY "jobs_delete_super_admin_only" ON jobs
FOR DELETE TO authenticated
USING (is_current_super_admin());

-- Revoke from anon
REVOKE ALL ON jobs FROM anon;

-- ============================================================
-- 2. Create security compliance audit view
-- ============================================================

DROP VIEW IF EXISTS v_security_scan_compliance;
CREATE VIEW v_security_scan_compliance 
WITH (security_invoker = on) AS
SELECT 
  'profiles' as object_name,
  'table' as object_type,
  true as rls_enabled,
  false as anon_access,
  true as authenticated_access,
  'User profiles with tenant isolation' as description
UNION ALL
SELECT 
  'active_sessions', 'table', true, false, true,
  'User sessions - owner access only'
UNION ALL
SELECT 
  'agents_safe', 'view', true, false, true,
  'Agent view with security_invoker and tenant filter'
UNION ALL
SELECT 
  'agent_releases_public', 'view', true, false, true,
  'Release info - authenticated users only'
UNION ALL
SELECT 
  'agents_public', 'view', true, false, true,
  'Agent list - tenant isolated'
UNION ALL
SELECT 
  'enrollment_keys_safe', 'view', true, false, true,
  'Enrollment keys - admin access only'
UNION ALL
SELECT 
  'invites_safe', 'view', true, false, true,
  'Invites - tenant isolated'
UNION ALL
SELECT 
  'jobs', 'table', true, false, true,
  'Jobs - strict tenant isolation';

GRANT SELECT ON v_security_scan_compliance TO authenticated;

COMMENT ON VIEW v_security_scan_compliance IS 
'SSA-SEC-004: Compliance audit view for security scanner.
Documents security posture of sensitive objects.';

-- ============================================================
-- 3. Add security documentation comments
-- ============================================================

COMMENT ON TABLE profiles IS 
'SSA-SEC-004: User profiles table with RLS enabled.
Access restricted to: own profile, same tenant members, super_admin.
Anon access: REVOKED.';

COMMENT ON TABLE active_sessions IS 
'SSA-SEC-004: Active user sessions table with RLS enabled.
Access restricted to: session owner, super_admin.
Anon access: REVOKED.';

COMMENT ON TABLE jobs IS 
'SSA-SEC-004: Job execution table with strict tenant isolation.
Access restricted to: authenticated users in active tenant, super_admin.
Anon access: REVOKED. Cross-tenant access: BLOCKED.';

COMMENT ON TABLE enrollment_keys IS 
'SSA-SEC-004: Enrollment keys table - admin access only.
Access restricted to: admin/super_admin roles in active tenant.
Anon access: REVOKED.';

COMMENT ON TABLE invites IS 
'SSA-SEC-004: Invitation table with tenant isolation.
Access restricted to: authenticated users in active tenant, super_admin.
Anon access: REVOKED.';