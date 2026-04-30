-- 1. Hardening is_current_super_admin to prevent cross-tenant bypass
-- We define a constant for the Platform Tenant ID (Pedro Alves's tenant)
CREATE OR REPLACE FUNCTION public.get_platform_tenant_id()
RETURNS uuid AS $$
  -- Hardcoded platform tenant ID from discovery
  SELECT '3adc67e6-8908-4d98-b85b-5e93be4673a1'::uuid;
$$ LANGUAGE sql IMMUTABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_current_super_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role = 'super_admin'
    AND tenant_id = public.get_platform_tenant_id() -- MUST be in platform tenant
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2. Revoking public access to sensitive functions
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM public, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.is_current_super_admin() FROM public, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.get_active_tenant_id() FROM public, authenticated, anon;

-- Re-granting only to authenticated where strictly necessary, or keeping them for RLS only (which works because RLS runs as user but can call functions)
-- Actually, RLS functions need to be executable by the roles that use them.
-- So we grant EXECUTE back, but since they are SECURITY DEFINER, we've fixed the internal logic.
GRANT EXECUTE ON FUNCTION public.is_current_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_tenant_id() TO authenticated;

-- has_role is particularly sensitive. Let's make a version that is safe for users.
CREATE OR REPLACE FUNCTION public.has_role_safe(_role app_role)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role = _role
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
GRANT EXECUTE ON FUNCTION public.has_role_safe(app_role) TO authenticated;

-- 3. Fixing the search_path for all identified functions (Linter fix)
ALTER FUNCTION public.get_active_tenant_id() SET search_path = public;
ALTER FUNCTION public.has_role(uuid, app_role) SET search_path = public;

-- 4. Improving RLS policies that might be slow or slightly incorrect
-- Ensuring ai_actions update check is strict
DROP POLICY IF EXISTS "ai_actions_update_tenant_isolation" ON public.ai_actions;
CREATE POLICY "ai_actions_update_tenant_isolation" ON public.ai_actions
FOR UPDATE TO authenticated
USING (
  public.is_current_super_admin() OR 
  tenant_id IN (SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('admin', 'super_admin'))
)
WITH CHECK (
  public.is_current_super_admin() OR 
  tenant_id IN (SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('admin', 'super_admin'))
);
