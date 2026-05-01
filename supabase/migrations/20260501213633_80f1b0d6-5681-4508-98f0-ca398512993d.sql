-- 1. Fix ai_insights RLS
ALTER TABLE public.ai_insights ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_insights_strict_tenant_isolation" ON public.ai_insights;
DROP POLICY IF EXISTS "ai_insights_select_active_tenant" ON public.ai_insights;

CREATE POLICY "ai_insights_select_active_tenant" 
ON public.ai_insights 
FOR SELECT 
TO authenticated 
USING (tenant_id = get_active_tenant_id() OR is_current_super_admin());

-- 2. Secure search_path for all SECURITY DEFINER functions
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

-- 3. Fix Agent Infrastructure
-- Extend enrollment key validity
UPDATE public.enrollment_keys 
SET expires_at = now() + interval '1 year' 
WHERE expires_at < now() + interval '1 year' OR expires_at IS NULL;

-- Procedure to re-activate agents if they are offline but have valid tokens
UPDATE public.agents 
SET status = 'active' 
WHERE status IN ('offline', 'inactive') 
AND id IN (SELECT agent_id FROM public.agent_tokens WHERE expires_at > now());
