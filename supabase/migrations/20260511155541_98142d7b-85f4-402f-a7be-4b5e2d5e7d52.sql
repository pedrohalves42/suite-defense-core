-- 1. Melhorar get_active_tenant_id para ser mais robusto e performático
CREATE OR REPLACE FUNCTION public.get_active_tenant_id()
RETURNS uuid 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claim text;
  v_user_id uuid;
  v_fallback_tenant_id uuid;
  v_is_super_admin boolean;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RETURN NULL; END IF;

  -- Cache do status de super admin
  v_is_super_admin := public.is_current_super_admin();

  -- 1. Tentar claim do JWT (Preferencial)
  BEGIN
    v_claim := current_setting('request.jwt.claims', true)::json->'app_metadata'->>'active_tenant_id';
  EXCEPTION WHEN OTHERS THEN
    v_claim := NULL;
  END;
  
  -- Se houver claim, validar acesso
  IF v_claim IS NOT NULL AND v_claim ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    IF v_is_super_admin OR EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = v_user_id 
      AND tenant_id = v_claim::uuid
    ) THEN
      RETURN v_claim::uuid;
    END IF;
  END IF;

  -- 2. Fallback: Se não houver claim ou for inválida, pegar o primeiro tenant do usuário
  -- Super admins sem tenant ativo veem o platform_tenant por padrão
  IF v_is_super_admin THEN
    RETURN public.get_platform_tenant_id();
  END IF;

  SELECT ur.tenant_id INTO v_fallback_tenant_id
  FROM public.user_roles ur
  WHERE ur.user_id = v_user_id
  ORDER BY 
    CASE 
      WHEN ur.role = 'admin' THEN 1
      ELSE 2
    END ASC,
    ur.created_at ASC
  LIMIT 1;

  RETURN v_fallback_tenant_id;
END;
$$;

-- 2. Corrigir políticas da tabela tenants (Segurança crítica)
-- Remover políticas antigas para garantir estado limpo
DROP POLICY IF EXISTS "Admins can view their tenant with full details" ON public.tenants;
DROP POLICY IF EXISTS "Users can view tenants they belong to" ON public.tenants;
DROP POLICY IF EXISTS "Super admins can view all tenants" ON public.tenants;

-- Nova política: Usuário só vê os tenants aos quais pertence OU se for super admin global
CREATE POLICY "tenants_access_policy" 
ON public.tenants 
FOR SELECT 
TO authenticated
USING (
  (id IN (SELECT tenant_id FROM public.user_roles WHERE user_id = auth.uid()))
  OR 
  public.is_current_super_admin()
);

-- 3. Reforçar RLS em tabelas de agentes e jobs para evitar falhas de visibilidade
-- Garante que se get_active_tenant_id falhar, o super admin ainda veja tudo
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agents_tenant_isolation_select ON public.agents;
CREATE POLICY "agents_tenant_isolation_select" 
ON public.agents 
FOR SELECT 
TO authenticated
USING (
  (tenant_id = public.get_active_tenant_id()) 
  OR 
  public.is_current_super_admin()
);

-- 4. Garantir que as funções críticas tenham permissões corretas
GRANT EXECUTE ON FUNCTION public.get_active_tenant_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_current_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_platform_tenant_id() TO authenticated;
