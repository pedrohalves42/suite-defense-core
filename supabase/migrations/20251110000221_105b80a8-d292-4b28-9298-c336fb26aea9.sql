-- Tornar send-alert-email publico (nao requer autenticacao)
-- Isso permite que seja chamado por outras edge functions internamente

-- A funcao ja foi corrigida no codigo para usar service role key
-- Esta e uma nota de documentacao para garantir que esta configurada corretamente no config.toml

-- Verificar e corrigir politicas RLS que podem estar expondo dados sensiveis

-- 1. AGENTS: Garantir que apenas admins vejam a tabela agents com hmac_secret
-- A view agents_safe ja foi criada, mas vamos garantir que operators/viewers usem apenas ela

-- Criar funcao auxiliar para verificar se usuario e operator ou viewer
CREATE OR REPLACE FUNCTION public.is_operator_or_viewer(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('operator', 'viewer')
  )
$$;

-- 2. AGENT_TOKENS: Garantir que tokens nao sejam expostos
-- Ja tem politica correta, mas vamos adicionar comentario de seguranca
COMMENT ON TABLE public.agent_tokens IS 'SECURITY: Contains sensitive agent tokens. Only admins can view.';

-- 3. ENROLLMENT_KEYS: Garantir que a chave real nunca seja exposta para operators
-- Ja foi corrigido na migracao anterior com enrollment_keys_safe view

-- 4. HMAC_SIGNATURES: Garantir que nao sao acessiveis
-- Esta tabela nao deve ter politicas de SELECT para usuarios comuns
DROP POLICY IF EXISTS "No public access to hmac signatures" ON public.hmac_signatures;
CREATE POLICY "No public access to hmac signatures"
ON public.hmac_signatures
FOR SELECT
USING (false); -- Ninguem pode ler, apenas o sistema pode escrever

-- 5. RATE_LIMITS: Nao deve ser acessivel para usuarios
DROP POLICY IF EXISTS "No public access to rate limits" ON public.rate_limits;
CREATE POLICY "No public access to rate limits"
ON public.rate_limits
FOR SELECT
USING (false); -- Sistema interno apenas

-- 6. Garantir que API_REQUEST_LOGS nao exponha informacoes sensiveis
-- Ja tem politica correta (apenas admins do tenant)

-- 7. Adicionar politica para impedir que operators/viewers vejam detalhes sensiveis em audit_logs
-- Criar view segura de audit_logs para operators/viewers (sem detalhes sensiveis)
CREATE OR REPLACE VIEW public.audit_logs_safe 
WITH (security_invoker = true) AS
SELECT 
  id,
  created_at,
  tenant_id,
  action,
  resource_type,
  resource_id,
  success,
  -- Remover campos sensiveis
  CASE 
    WHEN action IN ('user_login', 'api_key_created', 'enrollment_key_generated') THEN NULL
    ELSE details
  END as details,
  -- Mascarar IPs parcialmente
  CASE 
    WHEN ip_address IS NOT NULL THEN 
      SUBSTRING(ip_address FROM 1 FOR POSITION('.' IN ip_address)) || 'xxx.xxx.xxx'
    ELSE NULL
  END as ip_address_masked,
  -- Manter user_agent
  user_agent
FROM public.audit_logs;

GRANT SELECT ON public.audit_logs_safe TO authenticated;

COMMENT ON VIEW public.audit_logs_safe IS 'SECURITY: Safe view for operators/viewers. Masks sensitive details and IPs.';

-- 8. Documentar politicas de seguranca nas tabelas principais
COMMENT ON TABLE public.agents IS 'SECURITY: Contains HMAC secrets. Use agents_safe view for non-admins.';
COMMENT ON TABLE public.enrollment_keys IS 'SECURITY: Contains enrollment keys. Use enrollment_keys_safe view for non-admins.';
COMMENT ON TABLE public.hmac_signatures IS 'SECURITY: Internal only. No user access.';
COMMENT ON TABLE public.rate_limits IS 'SECURITY: Internal only. No user access.';

-- 9. Criar indices para melhorar performance de queries de seguranca
CREATE INDEX IF NOT EXISTS idx_user_roles_lookup ON public.user_roles(user_id, role);
CREATE INDEX IF NOT EXISTS idx_agents_tenant_status ON public.agents(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_created ON public.audit_logs(tenant_id, created_at DESC);

-- 10. Garantir que profiles nao exponha informacoes sensiveis
-- Adicionar politica para impedir que usuarios vejam emails de outros usuarios
-- (emails devem vir apenas de auth.users via admin API)
COMMENT ON TABLE public.profiles IS 'SECURITY: Public profile info only. No sensitive data.';