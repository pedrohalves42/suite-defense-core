-- =====================================================
-- SSA-SEC-005: Security Hardening for Sensitive Tables
-- =====================================================
-- Analysis shows:
-- 1. profiles: Current policy allows viewing profiles via user_roles tenant join - acceptable for collaboration
-- 2. tenants: Already has tenant isolation but needs admin-only restriction
-- 3. ai_actions: Already tenant-isolated but needs admin-only restriction
-- =====================================================

-- =====================================================
-- SECTION 1: PROFILES - Restrict to self + admins only
-- =====================================================
-- Current: Users can see profiles of anyone in their tenant (too permissive)
-- Fix: Users can only see their own profile; admins can see all in tenant

DROP POLICY IF EXISTS "profiles_select_authenticated" ON profiles;
DROP POLICY IF EXISTS "authenticated_select_profiles" ON profiles;

-- Policy: Users can only see their OWN profile OR admins can see tenant profiles
CREATE POLICY "profiles_select_self_or_admin" ON profiles
FOR SELECT TO authenticated
USING (
  user_id = auth.uid() 
  OR public.is_current_super_admin()
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin', 'super_admin')
      AND ur.tenant_id = public.get_active_tenant_id()
  )
);

COMMENT ON POLICY "profiles_select_self_or_admin" ON profiles IS
'SSA-SEC-005: Users can only view their own profile. Admins can view all profiles in their tenant for user management.';

-- =====================================================
-- SECTION 2: TENANTS - Restrict UPDATE to admin only
-- =====================================================

-- Current UPDATE uses has_role which may be too permissive
DROP POLICY IF EXISTS "Admins can manage tenants" ON tenants;

-- Only admins can update tenant data
CREATE POLICY "Tenant admins can update their tenant" ON tenants
FOR UPDATE TO authenticated
USING (
  id = public.get_active_tenant_id() AND
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin', 'super_admin')
      AND ur.tenant_id = id
  )
)
WITH CHECK (
  id = public.get_active_tenant_id() AND
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin', 'super_admin')
      AND ur.tenant_id = id
  )
);

-- Only super admins can INSERT/DELETE tenants
DROP POLICY IF EXISTS "Only super admins can create tenants" ON tenants;
CREATE POLICY "Only super admins can create tenants" ON tenants
FOR INSERT TO authenticated
WITH CHECK (public.is_current_super_admin());

DROP POLICY IF EXISTS "Only super admins can delete tenants" ON tenants;
CREATE POLICY "Only super admins can delete tenants" ON tenants
FOR DELETE TO authenticated
USING (public.is_current_super_admin());

COMMENT ON POLICY "Tenant admins can update their tenant" ON tenants IS
'SSA-SEC-005: Only tenant admins can update sensitive business data (CNPJ, addresses, contacts).';

COMMENT ON POLICY "Only super admins can create tenants" ON tenants IS
'SSA-SEC-005: Tenant creation restricted to super admins for platform governance.';

COMMENT ON POLICY "Only super admins can delete tenants" ON tenants IS
'SSA-SEC-005: Tenant deletion restricted to super admins for data protection.';

-- =====================================================
-- SECTION 3: AI_ACTIONS - Restrict to admin/analyst only
-- =====================================================

-- Update SELECT to require admin/analyst role
DROP POLICY IF EXISTS "ai_actions_select_active_tenant" ON ai_actions;

CREATE POLICY "ai_actions_select_admin_analyst" ON ai_actions
FOR SELECT TO authenticated
USING (
  public.is_current_super_admin()
  OR (
    tenant_id = public.get_active_tenant_id() AND
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin', 'super_admin', 'analyst')
        AND ur.tenant_id = public.get_active_tenant_id()
    )
  )
);

-- Update UPDATE to require admin role
DROP POLICY IF EXISTS "ai_actions_update_active_tenant" ON ai_actions;

CREATE POLICY "ai_actions_update_admin_only" ON ai_actions
FOR UPDATE TO authenticated
USING (
  public.is_current_super_admin()
  OR (
    tenant_id = public.get_active_tenant_id() AND
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin', 'super_admin')
        AND ur.tenant_id = public.get_active_tenant_id()
    )
  )
)
WITH CHECK (
  public.is_current_super_admin()
  OR (
    tenant_id = public.get_active_tenant_id() AND
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin', 'super_admin')
        AND ur.tenant_id = public.get_active_tenant_id()
    )
  )
);

COMMENT ON POLICY "ai_actions_select_admin_analyst" ON ai_actions IS
'SSA-SEC-005: AI security decisions restricted to admin/analyst roles to prevent attacker reconnaissance.';

COMMENT ON POLICY "ai_actions_update_admin_only" ON ai_actions IS
'SSA-SEC-005: Only admins can modify AI-driven security actions.';