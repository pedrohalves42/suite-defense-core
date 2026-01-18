-- ADR-027: Security Remediation - Phase 1 & 2
-- Fix critical view exposures and harden RLS policies

-- ============================================
-- PHASE 1: Critical View Fixes
-- ============================================

-- Fix 1.1: Recreate audit_logs_safe with tenant filter
DROP VIEW IF EXISTS public.audit_logs_safe;

CREATE VIEW public.audit_logs_safe
WITH (security_invoker = on) AS
SELECT 
  id,
  user_id,
  tenant_id,
  action,
  resource_type,
  resource_id,
  success,
  created_at
FROM public.audit_logs
WHERE (tenant_id = get_active_tenant_id()) 
   OR is_current_super_admin();

COMMENT ON VIEW public.audit_logs_safe IS 
  'ADR-027: Tenant-scoped audit logs. Excludes error_details and metadata for security.';

-- Fix 1.2: Recreate invites_safe with tenant filter
DROP VIEW IF EXISTS public.invites_safe;

CREATE VIEW public.invites_safe
WITH (security_invoker = on) AS
SELECT 
  id,
  tenant_id,
  email,
  role,
  status,
  invited_by,
  created_at,
  expires_at,
  accepted_at
FROM public.invites
WHERE (tenant_id = get_active_tenant_id()) 
   OR is_current_super_admin();

COMMENT ON VIEW public.invites_safe IS 
  'ADR-027: Tenant-scoped invites. Token excluded for security.';

-- ============================================
-- PHASE 2: Policy Hardening
-- ============================================

-- Fix 2.1: Remove {public} role policies from profiles
DROP POLICY IF EXISTS "profiles_select_active_tenant" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_active_tenant" ON public.profiles;
DROP POLICY IF EXISTS "users_can_insert_own_profile" ON public.profiles;
DROP POLICY IF EXISTS "users_can_read_own_profile" ON public.profiles;
DROP POLICY IF EXISTS "users_can_update_own_profile" ON public.profiles;

-- Create consolidated authenticated-only policies
CREATE POLICY "profiles_select_authenticated" ON public.profiles
FOR SELECT TO authenticated
USING (
  user_id = auth.uid() 
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur 
    WHERE ur.user_id = profiles.user_id 
    AND ur.tenant_id = get_active_tenant_id()
  )
  OR is_current_super_admin()
);

CREATE POLICY "profiles_insert_authenticated" ON public.profiles
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "profiles_update_authenticated" ON public.profiles
FOR UPDATE TO authenticated
USING (user_id = auth.uid() OR is_current_super_admin())
WITH CHECK (user_id = auth.uid() OR is_current_super_admin());

-- Fix 2.2: Harden audit_logs base table policy
DROP POLICY IF EXISTS "audit_logs_select_active_tenant" ON public.audit_logs;

CREATE POLICY "audit_logs_select_authenticated" ON public.audit_logs
FOR SELECT TO authenticated
USING (
  (tenant_id = get_active_tenant_id()) 
  OR is_current_super_admin()
);