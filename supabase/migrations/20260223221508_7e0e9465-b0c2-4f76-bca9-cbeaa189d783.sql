
-- =============================================================================
-- Cleanup: Remove duplicate/legacy SELECT policies (ADR-038)
-- All tables already have proper tenant-isolated policies via get_active_tenant_id()
-- =============================================================================

-- 1. agent_groups: duplicate SELECT policy (identical clause)
DROP POLICY IF EXISTS "agent_groups_select_authenticated" ON public.agent_groups;

-- 2. invites: duplicate SELECT policy (identical clause)  
DROP POLICY IF EXISTS "authenticated_select_invites" ON public.invites;

-- 3. agent_tokens: legacy SELECT policy using old user_roles join pattern
-- The newer agent_tokens_select_active_tenant covers this with get_active_tenant_id()
DROP POLICY IF EXISTS "Users can view tokens for agents in their tenant" ON public.agent_tokens;

-- 4. user_roles: legacy policies that are subsets of user_roles_select_active_tenant
DROP POLICY IF EXISTS "Super admins can view all user roles" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_select_own" ON public.user_roles;
