-- P0 Security Fix: Remove legacy insecure get_problematic_agents() function
-- This function has SECURITY DEFINER and no tenant validation
-- The secure version get_problematic_agents(p_tenant_id uuid) with SECURITY INVOKER remains

DROP FUNCTION IF EXISTS public.get_problematic_agents();