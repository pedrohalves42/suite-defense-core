-- 1. Correção de RLS Permissivo
DROP POLICY IF EXISTS "Tenants can view their own AI cache" ON public.ai_analysis_cache;
CREATE POLICY "Tenants can view their own AI cache" 
ON public.ai_analysis_cache 
FOR SELECT 
TO authenticated 
USING (tenant_id = get_active_tenant_id() OR is_current_super_admin());

-- 2. Restrição de Funções SECURITY DEFINER (Princípio do Menor Privilégio)
-- Revogar execução pública de funções críticas e conceder apenas ao service_role/super_admin
REVOKE EXECUTE ON FUNCTION public.rotate_hmac_signatures() FROM public, authenticated;
GRANT EXECUTE ON FUNCTION public.rotate_hmac_signatures() TO service_role;

REVOKE EXECUTE ON FUNCTION public.auto_provision_signing_key() FROM public, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_provision_signing_key() TO service_role;

REVOKE EXECUTE ON FUNCTION public.cleanup_stuck_pending_jobs() FROM public, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_stuck_pending_jobs() TO service_role;

REVOKE EXECUTE ON FUNCTION public.run_system_maintenance() FROM public, authenticated;
GRANT EXECUTE ON FUNCTION public.run_system_maintenance() TO service_role;

-- 3. Melhoria na Robustez do get_active_tenant_id
CREATE OR REPLACE FUNCTION public.get_active_tenant_id()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  v_claim text;
  v_user_id uuid;
  v_fallback_tenant_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RETURN NULL; END IF;

  -- 1. Tentar claim do JWT (Caminho padrão e performático)
  -- Adicionada verificação de sanidade para evitar erros de cast
  BEGIN
    v_claim := current_setting('request.jwt.claims', true)::json->'app_metadata'->>'active_tenant_id';
  EXCEPTION WHEN OTHERS THEN
    v_claim := NULL;
  END;
  
  IF v_claim IS NOT NULL AND v_claim ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    -- Cross-check JWT claim contra user_roles para prevenir spoofing
    IF EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = v_user_id 
      AND tenant_id = v_claim::uuid
    ) OR public.is_current_super_admin() THEN
      RETURN v_claim::uuid;
    END IF;
  END IF;

  -- 2. Fallback: Se não houver claim ou for inválida, pegar o primeiro tenant do usuário
  -- Ordenado por prioridade de role para garantir que o admin veja seu tenant principal primeiro
  SELECT ur.tenant_id INTO v_fallback_tenant_id
  FROM public.user_roles ur
  WHERE ur.user_id = v_user_id
  ORDER BY 
    CASE 
      WHEN ur.role = 'super_admin' THEN 1
      WHEN ur.role = 'admin' THEN 2
      ELSE 3
    END ASC,
    ur.created_at ASC
  LIMIT 1;

  RETURN v_fallback_tenant_id;
END;
$function$;

-- 4. Adição de Política RESTRICTIVE em tabelas críticas para segurança em profundidade
-- Garante que mesmo que uma política permissive falhe, o tenant_id seja respeitado
DROP POLICY IF EXISTS "restrict_tenant_access" ON public.agents;
CREATE POLICY "restrict_tenant_access" 
ON public.agents 
AS RESTRICTIVE 
TO authenticated 
USING (tenant_id = get_active_tenant_id() OR is_current_super_admin());

-- 5. Garantir Publicações de Realtime para o Dashboard
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'agents'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE agents;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'jobs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE jobs;
  END IF;
END $$;
