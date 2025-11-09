-- Adicionar RLS à view agents_safe para operators e viewers
-- A view já filtra hmac_secret, agora precisa filtrar por tenant

ALTER VIEW public.agents_safe SET (security_invoker = true);

-- Adicionar RLS à view - apenas usuários autenticados do tenant podem ver seus agentes
CREATE POLICY "Users can view agents in their tenant via safe view"
ON public.agents
FOR SELECT
USING (
  (has_role(auth.uid(), 'operator') OR has_role(auth.uid(), 'viewer'))
  AND tenant_id = current_user_tenant_id()
);

-- Documentação: hmac_signatures e rate_limits intencionalmente sem políticas
-- Apenas edge functions com service_role key devem acessar essas tabelas
-- RLS está habilitado mas sem políticas = ninguém pode acessar exceto service_role

COMMENT ON TABLE public.hmac_signatures IS 'SECURITY: No RLS policies by design. Only service role (edge functions) can access.';
COMMENT ON TABLE public.rate_limits IS 'SECURITY: No RLS policies by design. Only service role (edge functions) can access.';