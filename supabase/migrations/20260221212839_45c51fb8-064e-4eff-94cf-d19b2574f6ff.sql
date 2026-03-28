
-- ====================================================================
-- Tabela soar_playbooks: Define playbooks de resposta automatizada
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.soar_playbooks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT NOT NULL,
  trigger_conditions JSONB DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  auto_execute BOOLEAN NOT NULL DEFAULT false,
  auto_approve_critical BOOLEAN NOT NULL DEFAULT true,
  requires_approval BOOLEAN NOT NULL DEFAULT true,
  actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  cooldown_minutes INTEGER DEFAULT 30,
  last_triggered_at TIMESTAMPTZ,
  execution_count INTEGER DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.soar_playbooks IS 'Playbooks de resposta automatizada SOAR para remediacao de incidentes';

ALTER TABLE public.soar_playbooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view soar_playbooks for their tenant"
  ON public.soar_playbooks FOR SELECT
  USING (tenant_id IN (SELECT ur.tenant_id FROM user_roles ur WHERE ur.user_id = auth.uid()));

CREATE POLICY "Admins can manage soar_playbooks"
  ON public.soar_playbooks FOR ALL
  USING (tenant_id IN (
    SELECT ur.tenant_id FROM user_roles ur 
    WHERE ur.user_id = auth.uid() AND ur.role = ANY(ARRAY['admin'::app_role, 'super_admin'::app_role])
  ));

CREATE TRIGGER update_soar_playbooks_updated_at
  BEFORE UPDATE ON public.soar_playbooks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_soar_playbooks_tenant_active ON public.soar_playbooks(tenant_id, is_active);

-- ====================================================================
-- Tabela ai_feedback: Loop de feedback para melhoria continua da IA
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.ai_feedback (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  insight_id UUID REFERENCES public.ai_insights(id),
  action_id UUID REFERENCES public.ai_actions(id),
  user_id UUID,
  feedback_type TEXT NOT NULL CHECK (feedback_type IN ('useful', 'not_useful', 'incorrect', 'partially_useful')),
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  context JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ai_feedback IS 'Feedback dos operadores sobre insights e acoes de IA para ajuste continuo';

ALTER TABLE public.ai_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view ai_feedback for their tenant"
  ON public.ai_feedback FOR SELECT
  USING (tenant_id IN (SELECT ur.tenant_id FROM user_roles ur WHERE ur.user_id = auth.uid()));

CREATE POLICY "Users can insert ai_feedback for their tenant"
  ON public.ai_feedback FOR INSERT
  WITH CHECK (tenant_id IN (SELECT ur.tenant_id FROM user_roles ur WHERE ur.user_id = auth.uid()));

CREATE INDEX idx_ai_feedback_insight ON public.ai_feedback(insight_id);
CREATE INDEX idx_ai_feedback_action ON public.ai_feedback(action_id);
