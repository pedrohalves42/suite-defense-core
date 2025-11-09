-- Corrigir últimos 2 ERRORs críticos de segurança

-- 1. AGENTS: Remover política que permite operators/viewers verem hmac_secret
DROP POLICY IF EXISTS "Users can view agents in their tenant via safe view" ON public.agents;

-- Apenas admins podem acessar tabela agents diretamente (com hmac_secret)
-- Operators/viewers devem usar agents_safe view

-- 2. ENROLLMENT_KEYS: Restringir SELECT apenas para admins
DROP POLICY IF EXISTS "Operators can view enrollment keys in their tenant" ON public.enrollment_keys;

-- Criar view segura de enrollment_keys para operators (sem a chave real)
CREATE OR REPLACE VIEW public.enrollment_keys_safe 
WITH (security_invoker = true) AS
SELECT 
  id,
  tenant_id,
  description,
  created_by,
  created_at,
  expires_at,
  used_at,
  is_active,
  max_uses,
  current_uses,
  used_by_agent,
  -- Mascarar a chave real mostrando apenas os últimos 4 caracteres
  CASE 
    WHEN key IS NOT NULL THEN '****-****-****-' || RIGHT(key, 4)
    ELSE NULL
  END as key_masked
FROM public.enrollment_keys;

GRANT SELECT ON public.enrollment_keys_safe TO authenticated;

-- Adicionar política para operators verem apenas metadata de enrollment_keys
CREATE POLICY "Operators can view enrollment key metadata"
ON public.enrollment_keys
FOR SELECT
USING (
  has_role(auth.uid(), 'operator')
  AND tenant_id = current_user_tenant_id()
  AND false  -- Forçar uso da view enrollment_keys_safe
);

COMMENT ON VIEW public.enrollment_keys_safe IS 'SECURITY: Safe view for operators. Shows metadata but masks the actual enrollment key.';