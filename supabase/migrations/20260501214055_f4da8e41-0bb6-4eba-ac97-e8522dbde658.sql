-- 1. Correct revocation for trigger functions (no arguments)
DO $$ 
BEGIN
  REVOKE EXECUTE ON FUNCTION public.detect_agent_offline_reason() FROM public, authenticated;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'Could not revoke from detect_agent_offline_reason';
END $$;

-- 2. Hardening search_path for ALL functions in public schema that are SECURITY DEFINER
DO $$ 
DECLARE 
    r RECORD;
BEGIN 
    FOR r IN (
        SELECT proname, nspname, pg_get_function_identity_arguments(p.oid) as args
        FROM pg_proc p 
        JOIN pg_namespace n ON p.pronamespace = n.oid 
        WHERE p.prosecdef = true 
        AND n.nspname = 'public'
    ) LOOP
        BEGIN
            EXECUTE format('ALTER FUNCTION public.%I(%s) SET search_path = public', r.proname, r.args);
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Could not alter function %: %', r.proname, SQLERRM;
        END;
    END LOOP;
END $$;

-- 3. Ensure ai_insights RLS is bulletproof
ALTER TABLE public.ai_insights ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ai_insights_select_active_tenant" ON public.ai_insights;
CREATE POLICY "ai_insights_select_active_tenant" 
ON public.ai_insights 
FOR SELECT 
TO authenticated 
USING (
  (tenant_id = get_active_tenant_id() AND tenant_id IS NOT NULL) 
  OR is_current_super_admin()
);
