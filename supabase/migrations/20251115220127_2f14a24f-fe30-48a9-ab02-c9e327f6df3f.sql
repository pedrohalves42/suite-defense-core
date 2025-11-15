-- FASE 1: IA de Autoaprendizado - Tabelas Isoladas (Zero Risco)
-- Estas tabelas são 100% independentes e não afetam o funcionamento existente

-- Tabela de insights gerados pela IA
CREATE TABLE IF NOT EXISTS public.ai_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  insight_type TEXT NOT NULL, -- 'anomaly_detection', 'optimization', 'prediction', 'root_cause'
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  evidence JSONB NOT NULL DEFAULT '{}', -- Dados que levaram à conclusão
  recommendation TEXT,
  confidence_score NUMERIC(3,2) CHECK (confidence_score >= 0 AND confidence_score <= 1),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged BOOLEAN DEFAULT FALSE,
  acknowledged_by UUID REFERENCES auth.users(id),
  acknowledged_at TIMESTAMPTZ
);

-- Tabela de ações sugeridas/executadas pela IA
CREATE TABLE IF NOT EXISTS public.ai_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  insight_id UUID REFERENCES public.ai_insights(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL, -- 'create_alert', 'adjust_config', 'create_diagnostic_job'
  action_payload JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'executed', 'failed')),
  executed_at TIMESTAMPTZ,
  executed_by UUID REFERENCES auth.users(id),
  result JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tabela de padrões aprendidos ao longo do tempo
CREATE TABLE IF NOT EXISTS public.ai_learned_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  pattern_type TEXT NOT NULL, -- 'failure_pattern', 'performance_baseline', 'anomaly_threshold'
  pattern_data JSONB NOT NULL,
  occurrences INTEGER DEFAULT 1,
  first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confidence NUMERIC(3,2) CHECK (confidence >= 0 AND confidence <= 1),
  metadata JSONB DEFAULT '{}'
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_ai_insights_tenant_created ON public.ai_insights(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_insights_severity ON public.ai_insights(severity) WHERE acknowledged = FALSE;
CREATE INDEX IF NOT EXISTS idx_ai_actions_status ON public.ai_actions(status, tenant_id);
CREATE INDEX IF NOT EXISTS idx_ai_learned_patterns_tenant ON public.ai_learned_patterns(tenant_id, pattern_type);

-- RLS Policies: apenas admins e super_admins podem acessar

-- ai_insights
ALTER TABLE public.ai_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view insights for their tenant"
  ON public.ai_insights FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "System can insert insights"
  ON public.ai_insights FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Admins can update insights for their tenant"
  ON public.ai_insights FOR UPDATE
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'super_admin')
    )
  );

-- ai_actions
ALTER TABLE public.ai_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view actions for their tenant"
  ON public.ai_actions FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "System can insert actions"
  ON public.ai_actions FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Admins can update actions for their tenant"
  ON public.ai_actions FOR UPDATE
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'super_admin')
    )
  );

-- ai_learned_patterns
ALTER TABLE public.ai_learned_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view patterns for their tenant"
  ON public.ai_learned_patterns FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "System can manage patterns"
  ON public.ai_learned_patterns FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);