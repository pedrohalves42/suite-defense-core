
-- V-201: Remove redundant SELECT policies on agent_releases
-- The policy "agent_releases_select_authenticated" uses USING(true) which 
-- makes "Authenticated users can view active releases" and 
-- "agent_releases_select_active_or_admin" completely redundant.
-- The correct behavior is: authenticated users see active releases, admins see all.
-- So we DROP the USING(true) policy and keep the proper one.

DROP POLICY IF EXISTS "agent_releases_select_authenticated" ON public.agent_releases;
DROP POLICY IF EXISTS "Authenticated users can view active releases" ON public.agent_releases;

-- Keep agent_releases_select_active_or_admin which correctly allows:
-- Active releases for all authenticated users, all releases for admin/super_admin

-- V-202: Add missing SELECT/UPDATE/DELETE policies for approvals table
-- Currently only INSERT exists

CREATE POLICY "approvals_select_tenant_isolated" 
ON public.approvals 
FOR SELECT 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM approval_requests ar 
    WHERE ar.id = approvals.request_id 
      AND (ar.tenant_id = get_active_tenant_id() OR is_current_super_admin())
  )
);

CREATE POLICY "approvals_update_tenant_isolated" 
ON public.approvals 
FOR UPDATE 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM approval_requests ar 
    WHERE ar.id = approvals.request_id 
      AND (ar.tenant_id = get_active_tenant_id() OR is_current_super_admin())
  )
);

CREATE POLICY "approvals_delete_super_admin_only" 
ON public.approvals 
FOR DELETE 
TO authenticated
USING (is_current_super_admin());
