-- ============================================
-- PILAR 1: Web Access Policies
-- ============================================

-- Tabela para politicas de acesso web (allow/block/monitor)
CREATE TABLE IF NOT EXISTS public.web_access_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  domain text NOT NULL,
  action text NOT NULL CHECK (action IN ('allow', 'block', 'monitor')),
  reason text,
  source text CHECK (source IN ('manual', 'playbook', 'rule', 'threat_intel')),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  is_active boolean DEFAULT true,
  applied_at timestamptz,
  expires_at timestamptz,
  UNIQUE(tenant_id, domain)
);

-- Indices para performance
CREATE INDEX IF NOT EXISTS idx_web_access_policies_tenant_domain 
ON public.web_access_policies(tenant_id, domain);

CREATE INDEX IF NOT EXISTS idx_web_access_policies_active 
ON public.web_access_policies(tenant_id, is_active) 
WHERE is_active = true;

-- RLS
ALTER TABLE public.web_access_policies ENABLE ROW LEVEL SECURITY;

-- Admins podem gerenciar politicas do seu tenant
CREATE POLICY "Admins can manage web access policies"
ON public.web_access_policies
FOR ALL
USING (
  tenant_id IN (
    SELECT ur.tenant_id 
    FROM user_roles ur 
    WHERE ur.user_id = auth.uid() 
    AND ur.role IN ('admin', 'super_admin')
  )
)
WITH CHECK (
  tenant_id IN (
    SELECT ur.tenant_id 
    FROM user_roles ur 
    WHERE ur.user_id = auth.uid() 
    AND ur.role IN ('admin', 'super_admin')
  )
);

-- Usuarios podem ver politicas do seu tenant
CREATE POLICY "Users can view web access policies"
ON public.web_access_policies
FOR SELECT
USING (
  tenant_id IN (
    SELECT ur.tenant_id 
    FROM user_roles ur 
    WHERE ur.user_id = auth.uid()
  )
);

-- Trigger para updated_at
CREATE OR REPLACE TRIGGER update_web_access_policies_updated_at
BEFORE UPDATE ON public.web_access_policies
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Comentarios
COMMENT ON TABLE public.web_access_policies IS 'Politicas de acesso web por dominio (allow/block/monitor)';
COMMENT ON COLUMN public.web_access_policies.action IS 'Acao: allow=permitir, block=bloquear, monitor=monitorar';
COMMENT ON COLUMN public.web_access_policies.source IS 'Origem da politica: manual, playbook, rule, threat_intel';
COMMENT ON COLUMN public.web_access_policies.applied_at IS 'Quando a politica foi sincronizada com os agentes';

-- ============================================
-- PILAR 3: Execution Mode para Playbooks
-- ============================================

-- Adicionar coluna execution_mode aos playbooks
ALTER TABLE public.playbooks 
ADD COLUMN IF NOT EXISTS execution_mode text 
DEFAULT 'assistive'
CHECK (execution_mode IN ('assistive', 'semi_automatic', 'automatic'));

-- Atualizar playbooks existentes para modo assistivo
UPDATE public.playbooks 
SET execution_mode = 'assistive' 
WHERE execution_mode IS NULL;

-- Comentario
COMMENT ON COLUMN public.playbooks.execution_mode IS 'Modo de execucao: assistive=so recomenda, semi_automatic=executa com aprovacao, automatic=executa automaticamente';

-- ============================================
-- PLAYBOOKS DE SISTEMA: Web + Vulnerabilidades
-- ============================================

-- Playbook: Navegacao Suspeita Detectada
INSERT INTO public.playbooks (
  id, tenant_id, name, description, trigger_type, 
  trigger_conditions, severity, is_system, is_enabled, 
  require_approval, cooldown_minutes, execution_mode
)
VALUES (
  'a8000000-0000-0000-0000-000000000008',
  NULL,
  'Navegacao Suspeita Detectada',
  'Detectou acesso a dominio com score de risco alto. Cria politica de monitoramento e sugere bloqueio manual.',
  'suspicious_web_activity',
  '{"min_risk_score": 70, "categories": ["malware", "phishing", "suspicious"]}'::jsonb,
  'high',
  true,
  true,
  false,
  30,
  'assistive'
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  trigger_conditions = EXCLUDED.trigger_conditions,
  execution_mode = EXCLUDED.execution_mode;

-- Playbook: Vulnerabilidade Critica Detectada
INSERT INTO public.playbooks (
  id, tenant_id, name, description, trigger_type, 
  trigger_conditions, severity, is_system, is_enabled, 
  require_approval, cooldown_minutes, execution_mode
)
VALUES (
  'a9000000-0000-0000-0000-000000000009',
  NULL,
  'Vulnerabilidade Critica Detectada',
  'Detectou vulnerabilidade critica (CVSS >= 9.0) no endpoint. Cria alerta de alta prioridade e tarefa de remediacao.',
  'vulnerability_critical',
  '{"min_cvss": 9.0, "severity": ["critical"]}'::jsonb,
  'critical',
  true,
  true,
  true,
  60,
  'assistive'
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  trigger_conditions = EXCLUDED.trigger_conditions,
  execution_mode = EXCLUDED.execution_mode;

-- Playbook: Vulnerabilidade Alta Detectada
INSERT INTO public.playbooks (
  id, tenant_id, name, description, trigger_type, 
  trigger_conditions, severity, is_system, is_enabled, 
  require_approval, cooldown_minutes, execution_mode
)
VALUES (
  'aa000000-0000-0000-0000-00000000000a',
  NULL,
  'Vulnerabilidade Alta Detectada',
  'Detectou vulnerabilidade de alta severidade (CVSS >= 7.0) no endpoint. Cria insight e sugere acao de remediacao.',
  'vulnerability_high',
  '{"min_cvss": 7.0, "max_cvss": 8.9, "severity": ["high"]}'::jsonb,
  'high',
  true,
  true,
  false,
  120,
  'assistive'
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  trigger_conditions = EXCLUDED.trigger_conditions,
  execution_mode = EXCLUDED.execution_mode;

-- Playbook: Multiplos Dominios Maliciosos
INSERT INTO public.playbooks (
  id, tenant_id, name, description, trigger_type, 
  trigger_conditions, severity, is_system, is_enabled, 
  require_approval, cooldown_minutes, execution_mode
)
VALUES (
  'ab000000-0000-0000-0000-00000000000b',
  NULL,
  'Multiplos Acessos Maliciosos',
  'Detectou multiplos acessos a dominios maliciosos em curto periodo. Indica possivel infeccao ou comprometimento.',
  'multiple_malicious_access',
  '{"min_count": 3, "time_window_minutes": 60, "categories": ["malware", "c2", "botnet"]}'::jsonb,
  'critical',
  true,
  true,
  true,
  30,
  'assistive'
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  trigger_conditions = EXCLUDED.trigger_conditions,
  execution_mode = EXCLUDED.execution_mode;