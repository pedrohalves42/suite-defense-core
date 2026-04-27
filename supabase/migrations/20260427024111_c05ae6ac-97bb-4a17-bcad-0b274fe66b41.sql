-- Create helper function for RLS testing
CREATE OR REPLACE FUNCTION public.test_rls_isolation(target_user_id uuid, target_table text)
RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- 1. Switch session identity to simulate the target user
    -- We use SET LOCAL so it only affects the current transaction/call
    EXECUTE format('SET LOCAL ROLE authenticated');
    EXECUTE format('SET LOCAL "request.jwt.claims" = %L', json_build_object('sub', target_user_id)::text);
    
    -- 2. Execute query on target table as that user
    RETURN QUERY EXECUTE format('SELECT to_jsonb(t) FROM %I t', target_table);
END;
$$;

-- Address linter warnings about SECURITY DEFINER functions
-- These functions were flagged because they are SECURITY DEFINER and were granted to authenticated users.

-- Revoke execute from all to start fresh
REVOKE EXECUTE ON FUNCTION public.get_active_tenant_id() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_current_super_admin() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM public, anon, authenticated;

-- Grant only to essential roles. 
-- For these specific functions, they ARE needed by authenticated users for RLS to work, 
-- but we should ensure they are not used as vectors for privilege escalation.
-- Since they only return IDs or booleans based on auth.uid(), they are relatively safe.
-- However, we can restrict them to the postgres/service_role and only call them inside policies 
-- IF we didn't need them for client-side queries. 
-- Since Supabase client-side queries don't usually call these RPCs directly (except maybe via .rpc()), 
-- we can keep them restricted if only RLS needs them.
-- BUT, RLS runs as the user's role. So 'authenticated' NEEDS execute permission to run the policy.

GRANT EXECUTE ON FUNCTION public.get_active_tenant_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_current_super_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

-- Revoke public access to the test function itself for security
REVOKE ALL ON FUNCTION public.test_rls_isolation(uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.test_rls_isolation(uuid, text) TO service_role;
