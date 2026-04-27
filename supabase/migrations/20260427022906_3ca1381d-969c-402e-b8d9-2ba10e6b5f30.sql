-- 1. Fix ai_actions permissive policy
DROP POLICY IF EXISTS "Users can view actions for their tenant" ON public.ai_actions;

CREATE POLICY "ai_actions_tenant_isolation" 
ON public.ai_actions 
FOR SELECT 
TO authenticated
USING (tenant_id = get_active_tenant_id());

-- 2. Fix agent_hmac_signatures
DROP POLICY IF EXISTS "Enable insert for signatures" ON public.agent_hmac_signatures;
DROP POLICY IF EXISTS "Enable select for verification" ON public.agent_hmac_signatures;

-- 3. Fix ops_checks
DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.ops_checks;

CREATE POLICY "ops_checks_super_admin_only" 
ON public.ops_checks 
FOR ALL 
TO authenticated
USING (is_current_super_admin())
WITH CHECK (is_current_super_admin());

CREATE POLICY "ops_checks_view_all" 
ON public.ops_checks 
FOR SELECT 
TO authenticated
USING (true);

-- 4. Fix agent-scripts storage policies
DROP POLICY IF EXISTS "Os scripts do agente são legíveis publicamente" ON storage.objects;
DROP POLICY IF EXISTS "Agentes podem ler scripts por caminho" ON storage.objects;

CREATE POLICY "Agent scripts are restricted" 
ON storage.objects 
FOR SELECT 
TO service_role 
USING (bucket_id = 'agent-scripts');

-- 5. Function Hardening (Search Path and Execution Permissions)
DO $$
DECLARE
    func_record RECORD;
BEGIN
    FOR func_record IN 
        SELECT n.nspname as schema, p.proname as name, pg_get_function_identity_arguments(p.oid) as args
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
    LOOP
        EXECUTE format('ALTER FUNCTION %I.%I(%s) SET search_path = public', func_record.schema, func_record.name, func_record.args);
    END LOOP;
END $$;

-- 6. Revoke public execution of all functions for safety
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM public;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM authenticated;

-- Grant to safe roles
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO postgres;

-- Re-grant essential functions for the application
GRANT EXECUTE ON FUNCTION public.get_active_tenant_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_current_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
