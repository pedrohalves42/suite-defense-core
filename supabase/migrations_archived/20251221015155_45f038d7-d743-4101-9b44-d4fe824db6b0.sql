-- Tabela principal: historico de Risk Scores
CREATE TABLE public.tenant_risk_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  
  -- Scope: 'tenant' (global) ou 'agent' (por computador)
  scope text NOT NULL CHECK (scope IN ('tenant', 'agent')),
  agent_id uuid REFERENCES public.agents(id) ON DELETE CASCADE,
  
  -- Score calculado (0-100)
  score integer NOT NULL CHECK (score BETWEEN 0 AND 100),
  
  -- Breakdown explicavel em JSONB
  breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  
  -- Tendencia
  previous_score integer,
  trend text CHECK (trend IN ('up', 'down', 'stable')),
  
  -- Metadata
  calculated_at timestamptz NOT NULL DEFAULT now(),
  calculation_version text NOT NULL DEFAULT 'v1',
  
  -- Constraint: agent_id so pode existir se scope = 'agent'
  CONSTRAINT scope_agent_check CHECK (
    (scope = 'tenant' AND agent_id IS NULL) OR
    (scope = 'agent' AND agent_id IS NOT NULL)
  )
);

-- Indices para performance
CREATE INDEX idx_risk_scores_tenant_time ON public.tenant_risk_scores (tenant_id, calculated_at DESC);
CREATE INDEX idx_risk_scores_agent_time ON public.tenant_risk_scores (agent_id, calculated_at DESC) WHERE agent_id IS NOT NULL;
CREATE INDEX idx_risk_scores_scope ON public.tenant_risk_scores (tenant_id, scope);

-- Enable RLS
ALTER TABLE public.tenant_risk_scores ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Tenants podem ler seus proprios scores
CREATE POLICY tenant_read_scores ON public.tenant_risk_scores
FOR SELECT USING (
  tenant_id IN (
    SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid()
  )
);

-- RLS Policy: Service role pode inserir (Edge Function)
CREATE POLICY service_insert_scores ON public.tenant_risk_scores
FOR INSERT WITH CHECK (true);

-- RLS Policy: Super admins podem ver tudo
CREATE POLICY super_admin_read_scores ON public.tenant_risk_scores
FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin')
);