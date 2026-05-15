-- 1. Hardening de Funções SECURITY DEFINER (Correção F-001)
-- Refatorado para evitar erro com argumentos DEFAULT
DO $$ 
DECLARE 
    r RECORD;
    v_signature text;
BEGIN
    FOR r IN (
        SELECT 
            p.oid,
            n.nspname as schema_name,
            p.proname as function_name,
            pg_catalog.pg_get_function_identity_arguments(p.oid) as identity_args
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' 
          AND p.prosecdef = true 
          AND (p.proconfig IS NULL OR NOT (p.proconfig @> ARRAY['search_path=public, pg_catalog, pg_temp'::text]))
    ) LOOP
        -- pg_get_function_identity_arguments retorna apenas nome e tipos, sem defaults
        EXECUTE format('ALTER FUNCTION public.%I(%s) SET search_path = public, pg_catalog, pg_temp', r.function_name, r.identity_args);
    END LOOP;
END $$;

-- 2. Revogação de Acessos a Funções de Identidade (Reforço P0)
-- Nota: Usando nomes de argumentos explícitos para evitar ambiguidade se houver sobrecarga
REVOKE EXECUTE ON FUNCTION public.get_active_tenant_id() FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.is_current_super_admin() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_active_tenant_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_current_super_admin() TO authenticated, service_role;

-- 3. Fortificação de Storage (Correção F-004)
DROP POLICY IF EXISTS "Authenticated users can read agent scripts" ON storage.objects;
DROP POLICY IF EXISTS "agent_installers_authenticated_read" ON storage.objects;

CREATE POLICY "agent_scripts_tenant_isolation" ON storage.objects FOR SELECT 
TO authenticated
USING (
  bucket_id = 'agent-scripts' AND (
    (storage.foldername(name))[1] = public.get_active_tenant_id()::text
    OR (storage.foldername(name))[1] = 'scripts'
    OR public.is_current_super_admin()
  )
);

CREATE POLICY "agent_installers_tenant_isolation" ON storage.objects FOR SELECT 
TO authenticated
USING (
  bucket_id = 'agent-installers' AND (
    (storage.foldername(name))[1] = public.get_active_tenant_id()::text
    OR (storage.foldername(name))[1] = 'scripts'
    OR (storage.foldername(name))[1] = 'windows'
    OR public.is_current_super_admin()
  )
);

DROP POLICY IF EXISTS "Admins can upload installers" ON storage.objects;
CREATE POLICY "admins_can_upload_installers_isolated" ON storage.objects FOR INSERT 
TO authenticated
WITH CHECK (
  bucket_id = 'agent-installers' 
  AND (storage.foldername(name))[1] = public.get_active_tenant_id()::text
);
