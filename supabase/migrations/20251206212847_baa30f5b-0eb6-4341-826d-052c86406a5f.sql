-- Adicionar campos que faltam na tabela security_policies existente
ALTER TABLE public.security_policies 
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

-- Criar tabela de regras de politica
CREATE TABLE public.security_policy_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID NOT NULL REFERENCES public.security_policies(id) ON DELETE CASCADE,
  rule_type TEXT NOT NULL CHECK (rule_type IN (
    'usb_control',
    'software_restriction', 
    'website_block',
    'firewall_rule',
    'process_block',
    'file_access',
    'registry_protection',
    'network_restriction'
  )),
  action TEXT NOT NULL CHECK (action IN ('allow', 'block', 'audit', 'warn')),
  target TEXT NOT NULL,
  conditions JSONB DEFAULT '{}',
  is_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Criar tabela de associacao grupo-politica
CREATE TABLE public.agent_group_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.agent_groups(id) ON DELETE CASCADE,
  policy_id UUID NOT NULL REFERENCES public.security_policies(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ DEFAULT now(),
  assigned_by UUID REFERENCES auth.users(id),
  UNIQUE(group_id, policy_id)
);

-- Criar tabela de logs de aplicacao de politica
CREATE TABLE public.policy_enforcement_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL,
  policy_id UUID REFERENCES public.security_policies(id) ON DELETE SET NULL,
  rule_id UUID REFERENCES public.security_policy_rules(id) ON DELETE SET NULL,
  rule_type TEXT NOT NULL,
  action_taken TEXT NOT NULL,
  target TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  blocked BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indices para performance
CREATE INDEX idx_security_policy_rules_policy ON public.security_policy_rules(policy_id);
CREATE INDEX idx_agent_group_policies_group ON public.agent_group_policies(group_id);
CREATE INDEX idx_agent_group_policies_policy ON public.agent_group_policies(policy_id);
CREATE INDEX idx_policy_enforcement_logs_tenant ON public.policy_enforcement_logs(tenant_id);
CREATE INDEX idx_policy_enforcement_logs_agent ON public.policy_enforcement_logs(agent_id);
CREATE INDEX idx_policy_enforcement_logs_created ON public.policy_enforcement_logs(created_at DESC);

-- RLS para security_policy_rules
ALTER TABLE public.security_policy_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view rules"
ON public.security_policy_rules FOR SELECT
TO authenticated
USING (policy_id IN (
  SELECT id FROM security_policies WHERE tenant_id IN (
    SELECT tenant_id FROM user_roles WHERE user_id = auth.uid()
  )
));

CREATE POLICY "Admins can manage rules"
ON public.security_policy_rules FOR ALL
TO authenticated
USING (policy_id IN (
  SELECT id FROM security_policies WHERE tenant_id IN (
    SELECT tenant_id FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin')
  )
))
WITH CHECK (policy_id IN (
  SELECT id FROM security_policies WHERE tenant_id IN (
    SELECT tenant_id FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin')
  )
));

-- RLS para agent_group_policies
ALTER TABLE public.agent_group_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view group policies"
ON public.agent_group_policies FOR SELECT
TO authenticated
USING (group_id IN (
  SELECT id FROM agent_groups WHERE tenant_id IN (
    SELECT tenant_id FROM user_roles WHERE user_id = auth.uid()
  )
));

CREATE POLICY "Admins can manage group policies"
ON public.agent_group_policies FOR ALL
TO authenticated
USING (group_id IN (
  SELECT id FROM agent_groups WHERE tenant_id IN (
    SELECT tenant_id FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin')
  )
))
WITH CHECK (group_id IN (
  SELECT id FROM agent_groups WHERE tenant_id IN (
    SELECT tenant_id FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin')
  )
));

-- RLS para policy_enforcement_logs
ALTER TABLE public.policy_enforcement_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view enforcement logs"
ON public.policy_enforcement_logs FOR SELECT
TO authenticated
USING (tenant_id IN (SELECT tenant_id FROM user_roles WHERE user_id = auth.uid()));

CREATE POLICY "System can insert enforcement logs"
ON public.policy_enforcement_logs FOR INSERT
TO authenticated
WITH CHECK (tenant_id IN (SELECT tenant_id FROM user_roles WHERE user_id = auth.uid()));

COMMENT ON TABLE public.security_policy_rules IS 'Regras individuais dentro de cada politica';
COMMENT ON TABLE public.agent_group_policies IS 'Associacao entre grupos de agentes e politicas';
COMMENT ON TABLE public.policy_enforcement_logs IS 'Log de aplicacao/bloqueio de politicas pelos agentes';