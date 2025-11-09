-- Corrigir vulnerabilidades críticas encontradas no scan de segurança

-- 1. sales_contacts: Adicionar política SELECT apenas para admins (se não existir)
DROP POLICY IF EXISTS "Admins can view contacts" ON public.sales_contacts;

CREATE POLICY "Admins can view contacts" 
ON public.sales_contacts 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'));

-- 3. agent_tokens: Restringir SELECT de admin por tenant
DROP POLICY IF EXISTS "Admins podem ler tokens" ON public.agent_tokens;
DROP POLICY IF EXISTS "Admins can view tokens in their tenant" ON public.agent_tokens;

CREATE POLICY "Admins can view tokens in their tenant"
ON public.agent_tokens
FOR SELECT
USING (
  has_role(auth.uid(), 'admin') 
  AND agent_id IN (
    SELECT id FROM agents WHERE tenant_id = current_user_tenant_id()
  )
);

-- 4. agents: Criar view sem hmac_secret para operators/viewers
DROP VIEW IF EXISTS public.agents_safe;

CREATE VIEW public.agents_safe AS
SELECT 
  id,
  agent_name,
  tenant_id,
  enrolled_at,
  last_heartbeat,
  status,
  payload_hash
FROM public.agents;

GRANT SELECT ON public.agents_safe TO authenticated;

-- Atualizar política de agents - apenas admins podem ver tudo incluindo hmac_secret
DROP POLICY IF EXISTS "Operators and viewers can read agents in their tenant" ON public.agents;
DROP POLICY IF EXISTS "Operators can read safe agent data in their tenant" ON public.agents;

-- Admins podem ver tudo incluindo hmac_secret
-- Operators/viewers devem usar agents_safe view

-- 5. audit_logs: Apenas service role pode inserir
DROP POLICY IF EXISTS "Service can insert audit logs" ON public.audit_logs;