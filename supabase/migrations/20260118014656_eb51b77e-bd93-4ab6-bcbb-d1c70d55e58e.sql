-- ADR-026 Addendum: Block direct hmac_secret exposure (Finding #1 P1 CRITICAL)
-- Issue: Authenticated users can SELECT hmac_secret from agents table directly
-- Solution: Force all reads through agents_safe view which excludes hmac_secret

-- 1. Drop existing SELECT policies that could expose hmac_secret
DROP POLICY IF EXISTS "agents_select_active_tenant" ON public.agents;
DROP POLICY IF EXISTS "authenticated_select_agents" ON public.agents;
DROP POLICY IF EXISTS "Agents are viewable by authenticated users" ON public.agents;
DROP POLICY IF EXISTS "agents_tenant_select" ON public.agents;

-- 2. Create restrictive SELECT policy - DENY direct access for authenticated users
-- All reads must go through agents_safe view
CREATE POLICY "agents_deny_direct_select" ON public.agents
FOR SELECT 
TO authenticated
USING (false);

-- 3. Ensure service_role has full SELECT access (for Edge Functions)
DROP POLICY IF EXISTS "agents_service_role_select" ON public.agents;
CREATE POLICY "agents_service_role_select" ON public.agents
FOR SELECT 
TO service_role
USING (true);

-- 4. Verify agents_safe view has security_invoker enabled
-- This ensures RLS policies are applied based on the calling user's context
ALTER VIEW public.agents_safe SET (security_invoker = on);

-- 5. Add comment documenting the security decision
COMMENT ON POLICY "agents_deny_direct_select" ON public.agents 
IS 'ADR-026: Prevents direct SELECT on agents table to protect hmac_secret. Use agents_safe view instead.';