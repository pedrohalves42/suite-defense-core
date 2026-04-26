
-- =====================================================
-- SSA-SEC-003: HARDENING DE VIEWS PUBLICAS E POLITICAS
-- Correcao das 3 views publicas + politica DELETE
-- =====================================================

-- 1. Recriar agent_releases_public com security_invoker
DROP VIEW IF EXISTS public.agent_releases_public;
CREATE VIEW public.agent_releases_public
WITH (security_invoker = on)
AS
SELECT 
  id,
  version,
  channel,
  platform,
  is_active,
  release_notes,
  created_at
FROM public.agent_releases
WHERE is_active = true;

COMMENT ON VIEW public.agent_releases_public IS 'SSA-SEC-003: View publica de releases com security_invoker. Apenas usuarios autenticados. SOC2/ISO27001 compliant.';

REVOKE ALL ON public.agent_releases_public FROM anon, public;
GRANT SELECT ON public.agent_releases_public TO authenticated, service_role;

-- 2. Recriar profiles_public com security_invoker
DROP VIEW IF EXISTS public.profiles_public;
CREATE VIEW public.profiles_public
WITH (security_invoker = on)
AS
SELECT 
  user_id,
  username,
  full_name
FROM public.profiles;

COMMENT ON VIEW public.profiles_public IS 'SSA-SEC-003: View publica de perfis com security_invoker. Apenas usuarios autenticados no mesmo tenant. SOC2/ISO27001 compliant.';

REVOKE ALL ON public.profiles_public FROM anon, public;
GRANT SELECT ON public.profiles_public TO authenticated, service_role;

-- 3. Recriar agents_public com security_invoker e filtro de tenant
DROP VIEW IF EXISTS public.agents_public;
CREATE VIEW public.agents_public
WITH (security_invoker = on)
AS
SELECT 
  id,
  tenant_id,
  agent_name,
  hostname,
  status,
  os_type,
  os_version,
  agent_version,
  display_name,
  enrolled_at,
  last_heartbeat,
  agent_mode,
  agent_state,
  agent_state_reason,
  agent_state_changed_at
FROM public.agents
WHERE (
  (tenant_id = get_active_tenant_id() OR is_current_super_admin())
  AND archived_at IS NULL
);

COMMENT ON VIEW public.agents_public IS 'SSA-SEC-003: View publica de agentes com security_invoker e isolamento de tenant. SOC2/ISO27001 compliant.';

REVOKE ALL ON public.agents_public FROM anon, public;
GRANT SELECT ON public.agents_public TO authenticated, service_role;

-- 4. Adicionar politica DELETE em agent_signing_keys
-- Ninguem pode deletar chaves de assinatura (imutabilidade)
CREATE POLICY "agent_signing_keys_no_delete"
ON public.agent_signing_keys
FOR DELETE
TO authenticated
USING (false);

COMMENT ON POLICY "agent_signing_keys_no_delete" ON public.agent_signing_keys IS 'SSA-SEC-003: Chaves de assinatura sao imutaveis. Deletar e proibido para garantir auditabilidade.';
