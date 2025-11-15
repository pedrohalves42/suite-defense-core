-- =============================================
-- FASE 2: IA com Ações Aprovadas (Actionable AI)
-- =============================================

-- 1. Tabela de configuração de ações permitidas (Whitelist)
CREATE TABLE IF NOT EXISTS public.ai_action_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type TEXT NOT NULL UNIQUE,
  is_enabled BOOLEAN DEFAULT false,
  requires_approval BOOLEAN DEFAULT true,
  max_executions_per_day INTEGER DEFAULT 10,
  description TEXT,
  risk_level TEXT DEFAULT 'medium' CHECK (risk_level IN ('low', 'medium', 'high')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Tabela de execuções de ações (Audit log)
CREATE TABLE IF NOT EXISTS public.ai_action_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id UUID REFERENCES public.ai_actions(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  executed_by UUID REFERENCES auth.users(id),
  execution_status TEXT DEFAULT 'pending' CHECK (execution_status IN ('pending', 'approved', 'rejected', 'executed', 'failed')),
  execution_result JSONB,
  error_message TEXT,
  executed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Índices para performance
CREATE INDEX IF NOT EXISTS idx_ai_action_executions_tenant ON public.ai_action_executions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ai_action_executions_action ON public.ai_action_executions(action_id);
CREATE INDEX IF NOT EXISTS idx_ai_action_executions_status ON public.ai_action_executions(execution_status);
CREATE INDEX IF NOT EXISTS idx_ai_action_executions_executed_at ON public.ai_action_executions(executed_at);

-- 4. RLS Policies para ai_action_configs
ALTER TABLE public.ai_action_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view action configs"
  ON public.ai_action_configs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Super admins can manage action configs"
  ON public.ai_action_configs
  FOR ALL
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

-- 5. RLS Policies para ai_action_executions
ALTER TABLE public.ai_action_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view executions for their tenant"
  ON public.ai_action_executions
  FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "System can insert executions"
  ON public.ai_action_executions
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "System can update executions"
  ON public.ai_action_executions
  FOR UPDATE
  USING (true);

-- 6. Seed data - Ações permitidas (TODAS requerem aprovação inicialmente)
INSERT INTO public.ai_action_configs (action_type, is_enabled, requires_approval, risk_level, description, max_executions_per_day)
VALUES
  ('create_diagnostic_job', true, true, 'low', 'Criar job de diagnóstico para agente com problemas', 20),
  ('create_system_alert', true, true, 'low', 'Criar alerta no sistema para notificar administradores', 30),
  ('suggest_agent_restart', true, true, 'medium', 'Sugerir restart de agente (não executa automaticamente)', 10),
  ('suggest_config_change', true, true, 'medium', 'Sugerir mudança de configuração (não aplica automaticamente)', 10),
  ('suggest_job_cleanup', true, true, 'medium', 'Sugerir limpeza de jobs antigos ou travados', 5),
  ('quarantine_agent', false, true, 'high', 'Colocar agente em quarentena (DESABILITADO por padrão)', 3),
  ('delete_old_data', false, true, 'high', 'Deletar dados antigos (DESABILITADO por padrão)', 2)
ON CONFLICT (action_type) DO NOTHING;

-- 7. Feature flags para controle por tenant
-- Nota: será inserido via código quando tenant for criado, ou manualmente para tenants existentes

-- 8. Função para verificar rate limit de ações
CREATE OR REPLACE FUNCTION public.check_action_rate_limit(
  p_action_type TEXT,
  p_tenant_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
  v_max_executions INTEGER;
  v_today_executions INTEGER;
BEGIN
  -- Buscar limite configurado
  SELECT max_executions_per_day INTO v_max_executions
  FROM public.ai_action_configs
  WHERE action_type = p_action_type AND is_enabled = true;
  
  IF v_max_executions IS NULL THEN
    RETURN false; -- Ação não existe ou está desabilitada
  END IF;
  
  -- Contar execuções hoje
  SELECT COUNT(*) INTO v_today_executions
  FROM public.ai_action_executions ae
  JOIN public.ai_actions a ON ae.action_id = a.id
  WHERE a.action_type = p_action_type
    AND ae.tenant_id = p_tenant_id
    AND ae.execution_status = 'executed'
    AND ae.executed_at >= CURRENT_DATE;
  
  RETURN v_today_executions < v_max_executions;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;