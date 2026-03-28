-- Fase 2: Tabela de cache de Threat Intelligence
CREATE TABLE public.threat_intelligence_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('url', 'ip', 'domain')),
  reputation TEXT NOT NULL CHECK (reputation IN ('clean', 'suspicious', 'malicious', 'unknown')),
  risk_score INTEGER CHECK (risk_score >= 0 AND risk_score <= 100),
  sources JSONB DEFAULT '[]'::jsonb,
  whois_data JSONB,
  ssl_data JSONB,
  raw_responses JSONB DEFAULT '{}'::jsonb,
  cached_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours',
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indices para performance
CREATE INDEX idx_tic_target ON threat_intelligence_cache(target, target_type);
CREATE INDEX idx_tic_tenant ON threat_intelligence_cache(tenant_id);
CREATE INDEX idx_tic_expires ON threat_intelligence_cache(expires_at);
CREATE UNIQUE INDEX idx_tic_unique_target ON threat_intelligence_cache(target, target_type, tenant_id);

-- RLS
ALTER TABLE threat_intelligence_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their tenant threat intel cache"
ON threat_intelligence_cache FOR SELECT
USING (tenant_id IN (SELECT tenant_id FROM user_roles WHERE user_id = auth.uid()));

CREATE POLICY "Service role can manage threat intel cache"
ON threat_intelligence_cache FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Fase 3: Tabela de metricas de IA
CREATE TABLE public.ai_inference_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  function_name TEXT NOT NULL,
  model TEXT NOT NULL,
  latency_ms INTEGER NOT NULL,
  success BOOLEAN NOT NULL DEFAULT true,
  tokens_prompt INTEGER,
  tokens_completion INTEGER,
  tokens_total INTEGER,
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  error TEXT,
  used_fallback BOOLEAN DEFAULT FALSE,
  circuit_breaker_state TEXT CHECK (circuit_breaker_state IN ('closed', 'open', 'half-open')),
  request_metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indices para queries rapidas
CREATE INDEX idx_ai_metrics_function ON ai_inference_metrics(function_name, created_at DESC);
CREATE INDEX idx_ai_metrics_tenant ON ai_inference_metrics(tenant_id, created_at DESC);
CREATE INDEX idx_ai_metrics_success ON ai_inference_metrics(success, created_at DESC);
CREATE INDEX idx_ai_metrics_model ON ai_inference_metrics(model, created_at DESC);
CREATE INDEX idx_ai_metrics_created ON ai_inference_metrics(created_at DESC);

-- RLS
ALTER TABLE ai_inference_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view AI metrics in their tenant"
ON ai_inference_metrics FOR SELECT
USING (
  tenant_id IN (SELECT tenant_id FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin')
);

CREATE POLICY "Super admins can view all AI metrics"
ON ai_inference_metrics FOR SELECT
USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin'));

CREATE POLICY "Service role can manage AI metrics"
ON ai_inference_metrics FOR ALL
TO service_role
USING (true)
WITH CHECK (true);