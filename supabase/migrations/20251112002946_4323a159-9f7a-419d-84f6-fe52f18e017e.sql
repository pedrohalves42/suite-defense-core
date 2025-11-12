-- ============================================================================
-- FIX: Remove Infinite Recursion in RLS Policies
-- ============================================================================
-- Problem: Policies making direct SELECT queries to user_roles table cause
-- infinite recursion (42P17 error). This affects multiple tables.
-- 
-- Solution: Drop all recursive policies and keep only SECURITY DEFINER
-- function-based policies (has_role, is_super_admin, current_user_tenant_id)
-- ============================================================================

-- ============================================================================
-- STEP 1: Drop Recursive Policies from user_roles
-- ============================================================================
DROP POLICY IF EXISTS "super_admins_can_view_all_roles" ON public.user_roles;
DROP POLICY IF EXISTS "users_can_view_own_roles" ON public.user_roles;

-- ============================================================================
-- STEP 2: Drop Recursive Policies from tenants
-- ============================================================================
DROP POLICY IF EXISTS "super_admins_can_view_all_tenants" ON public.tenants;
DROP POLICY IF EXISTS "users_can_view_own_tenant" ON public.tenants;

-- ============================================================================
-- STEP 3: Drop Recursive Policies from audit_logs
-- ============================================================================
DROP POLICY IF EXISTS "super_admins_can_view_all_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "admins_can_view_tenant_logs" ON public.audit_logs;

-- ============================================================================
-- STEP 4: Drop Recursive Policies from invites
-- ============================================================================
DROP POLICY IF EXISTS "admins_can_view_tenant_invites" ON public.invites;
DROP POLICY IF EXISTS "admins_can_create_invites" ON public.invites;
DROP POLICY IF EXISTS "admins_can_delete_tenant_invites" ON public.invites;

-- ============================================================================
-- STEP 5: Add warning comment to prevent future issues
-- ============================================================================
COMMENT ON TABLE public.user_roles IS 'CRITICAL: NEVER use direct SELECT queries to this table inside RLS policies. Always use SECURITY DEFINER functions: has_role(), is_super_admin(), current_user_tenant_id()';

-- ============================================================================
-- Verification Log
-- ============================================================================
DO $$
DECLARE
  policy_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'user_roles';
  
  RAISE NOTICE 'Migration completed. Recursive policies removed. Remaining policies on user_roles: %', policy_count;
END $$;