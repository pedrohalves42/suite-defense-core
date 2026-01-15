-- =============================================================================
-- Security Hardening: Restrict RLS policies from 'public' to 'authenticated'
-- Tables: user_roles, virus_scans
-- =============================================================================

-- USER_ROLES: Drop and recreate with authenticated role
DROP POLICY IF EXISTS "user_roles_delete_active_tenant" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_insert_active_tenant" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_select_active_tenant" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_update_active_tenant" ON public.user_roles;

CREATE POLICY "user_roles_delete_active_tenant" ON public.user_roles
  FOR DELETE TO authenticated
  USING (is_current_super_admin());

CREATE POLICY "user_roles_insert_active_tenant" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK ((tenant_id = get_active_tenant_id()) OR is_current_super_admin());

CREATE POLICY "user_roles_select_active_tenant" ON public.user_roles
  FOR SELECT TO authenticated
  USING ((tenant_id = get_active_tenant_id()) OR (user_id = auth.uid()) OR is_current_super_admin());

CREATE POLICY "user_roles_update_active_tenant" ON public.user_roles
  FOR UPDATE TO authenticated
  USING ((tenant_id = get_active_tenant_id()) OR is_current_super_admin())
  WITH CHECK ((tenant_id = get_active_tenant_id()) OR is_current_super_admin());

-- VIRUS_SCANS: Drop and recreate with authenticated role
DROP POLICY IF EXISTS "virus_scans_delete_active_tenant" ON public.virus_scans;
DROP POLICY IF EXISTS "virus_scans_insert_active_tenant" ON public.virus_scans;
DROP POLICY IF EXISTS "virus_scans_select_active_tenant" ON public.virus_scans;
DROP POLICY IF EXISTS "virus_scans_update_active_tenant" ON public.virus_scans;

CREATE POLICY "virus_scans_delete_active_tenant" ON public.virus_scans
  FOR DELETE TO authenticated
  USING ((tenant_id = get_active_tenant_id()) OR is_current_super_admin());

CREATE POLICY "virus_scans_insert_active_tenant" ON public.virus_scans
  FOR INSERT TO authenticated
  WITH CHECK ((tenant_id = get_active_tenant_id()) OR is_current_super_admin());

CREATE POLICY "virus_scans_select_active_tenant" ON public.virus_scans
  FOR SELECT TO authenticated
  USING ((tenant_id = get_active_tenant_id()) OR is_current_super_admin());

CREATE POLICY "virus_scans_update_active_tenant" ON public.virus_scans
  FOR UPDATE TO authenticated
  USING ((tenant_id = get_active_tenant_id()) OR is_current_super_admin())
  WITH CHECK ((tenant_id = get_active_tenant_id()) OR is_current_super_admin());