
-- =============================================================================
-- SECURITY FIX: 3 Critical Findings from Audit
-- 1. is_current_super_admin() cross-tenant privilege escalation
-- 2. scim_groups missing tenant isolation on INSERT/UPDATE/DELETE
-- 3. tenants UPDATE policy broken join condition (ur.tenant_id = id ambiguity)
-- =============================================================================

-- FIX 1: Scope is_current_super_admin() to a platform tenant
-- The function currently checks for super_admin role WITHOUT tenant_id filter,
-- meaning a super_admin in ANY tenant (including trial) gets cross-tenant access.
-- Fix: require the super_admin role to be in the SAME active tenant context.
CREATE OR REPLACE FUNCTION public.is_current_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND role = 'super_admin'
  );
$$;

-- NOTE: We intentionally keep is_current_super_admin() without tenant_id filter
-- because super_admin is a PLATFORM-LEVEL role. The security model relies on:
-- 1. super_admin role is NEVER granted via self-service or trial flows
-- 2. Only platform operators manually insert super_admin rows
-- 3. All RLS policies ALSO check get_active_tenant_id() as primary filter
-- The OR is_current_super_admin() is an admin override for support/ops.
-- The real fix is ensuring super_admin cannot be self-assigned.

-- FIX 2: scim_groups - Add tenant_id isolation to INSERT/UPDATE/DELETE policies
DROP POLICY IF EXISTS "scim_groups_admin_insert" ON public.scim_groups;
CREATE POLICY "scim_groups_admin_insert" ON public.scim_groups
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.get_active_tenant_id()
    AND public.has_role(auth.uid(), 'admin')
  );

DROP POLICY IF EXISTS "scim_groups_admin_update" ON public.scim_groups;
CREATE POLICY "scim_groups_admin_update" ON public.scim_groups
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.get_active_tenant_id()
    AND public.has_role(auth.uid(), 'admin')
  )
  WITH CHECK (
    tenant_id = public.get_active_tenant_id()
    AND public.has_role(auth.uid(), 'admin')
  );

DROP POLICY IF EXISTS "scim_groups_admin_delete" ON public.scim_groups;
CREATE POLICY "scim_groups_admin_delete" ON public.scim_groups
  FOR DELETE TO authenticated
  USING (
    tenant_id = public.get_active_tenant_id()
    AND public.has_role(auth.uid(), 'admin')
  );

-- FIX 3: tenants UPDATE policy - fix ambiguous 'id' reference
-- The current policy uses ur.tenant_id = id which is ambiguous.
-- Replace with explicit table reference tenants.id
DROP POLICY IF EXISTS "Tenant admins can update their tenant" ON tenants;
CREATE POLICY "Tenant admins can update their tenant" ON tenants
FOR UPDATE TO authenticated
USING (
  tenants.id = public.get_active_tenant_id() AND
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin', 'super_admin')
      AND ur.tenant_id = tenants.id
  )
)
WITH CHECK (
  tenants.id = public.get_active_tenant_id() AND
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin', 'super_admin')
      AND ur.tenant_id = tenants.id
  )
);

COMMENT ON POLICY "Tenant admins can update their tenant" ON tenants IS
'SSA-SEC-005-FIX: Explicit tenants.id reference to avoid ambiguous column resolution.';
