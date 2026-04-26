-- ===========================================
-- FUNCIONALIDADE 2: Onboarding Automatizado
-- ===========================================

-- Tabela de progresso do onboarding
CREATE TABLE IF NOT EXISTS public.onboarding_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  tenant_id UUID REFERENCES public.tenants(id),
  current_step INTEGER DEFAULT 0,
  steps_completed JSONB DEFAULT '[]'::jsonb,
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  skipped BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS para onboarding_progress
ALTER TABLE public.onboarding_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own onboarding progress"
  ON public.onboarding_progress FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own onboarding progress"
  ON public.onboarding_progress FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own onboarding progress"
  ON public.onboarding_progress FOR UPDATE
  USING (user_id = auth.uid());

-- Indices
CREATE INDEX IF NOT EXISTS idx_onboarding_progress_user_id ON public.onboarding_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_progress_tenant_id ON public.onboarding_progress(tenant_id);

-- ===========================================
-- FUNCIONALIDADE 3: SLOs Formais
-- ===========================================

-- Definicoes de SLO
CREATE TABLE IF NOT EXISTS public.slo_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,
  target_percent NUMERIC(5,2) NOT NULL,
  measurement_window TEXT DEFAULT '24h',
  category TEXT DEFAULT 'availability',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS para slo_definitions
ALTER TABLE public.slo_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view SLO definitions"
  ON public.slo_definitions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('admin', 'super_admin')
  ));

CREATE POLICY "Super admins can manage SLO definitions"
  ON public.slo_definitions FOR ALL
  USING (EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() 
    AND role = 'super_admin'
  ));

-- Medicoes de SLO
CREATE TABLE IF NOT EXISTS public.slo_measurements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slo_id UUID REFERENCES public.slo_definitions(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES public.tenants(id),
  measured_at TIMESTAMPTZ DEFAULT now(),
  current_value NUMERIC(5,2),
  target_value NUMERIC(5,2),
  error_budget_used NUMERIC(5,2),
  sample_size INTEGER,
  is_breached BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS para slo_measurements
ALTER TABLE public.slo_measurements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view SLO measurements for their tenant"
  ON public.slo_measurements FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM user_roles WHERE user_id = auth.uid()
    ) OR EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role = 'super_admin'
    )
  );

CREATE POLICY "Service role can insert SLO measurements"
  ON public.slo_measurements FOR INSERT
  WITH CHECK (true);

-- Indices
CREATE INDEX IF NOT EXISTS idx_slo_measurements_slo_id ON public.slo_measurements(slo_id);
CREATE INDEX IF NOT EXISTS idx_slo_measurements_tenant_id ON public.slo_measurements(tenant_id);
CREATE INDEX IF NOT EXISTS idx_slo_measurements_measured_at ON public.slo_measurements(measured_at DESC);

-- Alertas de SLO
CREATE TABLE IF NOT EXISTS public.slo_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slo_id UUID REFERENCES public.slo_definitions(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES public.tenants(id),
  measurement_id UUID REFERENCES public.slo_measurements(id) ON DELETE CASCADE,
  severity TEXT DEFAULT 'warning',
  message TEXT,
  acknowledged BOOLEAN DEFAULT false,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS para slo_alerts
ALTER TABLE public.slo_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view SLO alerts for their tenant"
  ON public.slo_alerts FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM user_roles WHERE user_id = auth.uid()
    ) OR EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role = 'super_admin'
    )
  );

CREATE POLICY "Admins can update SLO alerts"
  ON public.slo_alerts FOR UPDATE
  USING (
    tenant_id IN (
      SELECT tenant_id FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'super_admin')
    )
  );

-- Indices
CREATE INDEX IF NOT EXISTS idx_slo_alerts_slo_id ON public.slo_alerts(slo_id);
CREATE INDEX IF NOT EXISTS idx_slo_alerts_tenant_id ON public.slo_alerts(tenant_id);

-- ===========================================
-- Inserir SLOs padrao
-- ===========================================

INSERT INTO public.slo_definitions (name, display_name, description, target_percent, measurement_window, category) VALUES
  ('heartbeat_success', 'Taxa de Sinal de Vida', 'Percentual de agentes respondendo dentro do intervalo esperado', 99.90, '24h', 'availability'),
  ('job_success', 'Taxa de Sucesso de Tarefas', 'Percentual de jobs completados sem erro', 99.50, '24h', 'quality'),
  ('agent_uptime', 'Disponibilidade de Agentes', 'Percentual de agentes online', 99.00, '24h', 'availability'),
  ('api_latency_p99', 'Latencia da API (p99)', '99% das requisicoes respondidas em menos de 2 segundos', 99.00, '1h', 'latency'),
  ('enrollment_success', 'Taxa de Instalacao', 'Percentual de enrollment keys usadas com sucesso', 95.00, '7d', 'quality')
ON CONFLICT (name) DO NOTHING;