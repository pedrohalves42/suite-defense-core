
-- SAML SSO Tables
CREATE TABLE IF NOT EXISTS public.saml_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL,
    entity_id TEXT NOT NULL,
    sso_url TEXT NOT NULL,
    certificate TEXT NOT NULL DEFAULT '',
    attribute_mapping JSONB DEFAULT '{"email": "email", "firstName": "firstName", "lastName": "lastName", "groups": "groups"}',
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_saml_configs_tenant ON public.saml_configs(tenant_id);

ALTER TABLE public.saml_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "saml_configs_service_role_all" ON public.saml_configs
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "saml_configs_select_own_tenant" ON public.saml_configs
    FOR SELECT TO authenticated
    USING (
      tenant_id IN (
        SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid()
      )
    );

-- SLI/SLO Tables
CREATE TABLE IF NOT EXISTS public.sli_metrics_hourly (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL DEFAULT 'global',
    endpoint VARCHAR(255) NOT NULL,
    hour TIMESTAMP WITH TIME ZONE NOT NULL,
    total_requests INTEGER NOT NULL DEFAULT 0,
    success_requests INTEGER NOT NULL DEFAULT 0,
    error_requests INTEGER NOT NULL DEFAULT 0,
    total_latency_ms BIGINT NOT NULL DEFAULT 0,
    max_latency_ms INTEGER NOT NULL DEFAULT 0,
    min_latency_ms INTEGER NOT NULL DEFAULT 999999,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(tenant_id, endpoint, hour)
);

CREATE INDEX IF NOT EXISTS idx_sli_metrics_tenant_hour ON public.sli_metrics_hourly(tenant_id, hour);

ALTER TABLE public.sli_metrics_hourly ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sli_metrics_service_role_all" ON public.sli_metrics_hourly
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.slo_error_budget_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL DEFAULT 'global',
    endpoint VARCHAR(255) NOT NULL,
    status_code INTEGER NOT NULL,
    error_budget_consumed FLOAT NOT NULL DEFAULT 1,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    details JSONB
);

CREATE INDEX IF NOT EXISTS idx_slo_events_tenant_time ON public.slo_error_budget_events(tenant_id, timestamp);

ALTER TABLE public.slo_error_budget_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "slo_events_service_role_all" ON public.slo_error_budget_events
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- On-Call Tables
CREATE TABLE IF NOT EXISTS public.oncall_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    timezone VARCHAR(50) DEFAULT 'UTC',
    rotation JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.oncall_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "oncall_schedules_service_role_all" ON public.oncall_schedules
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.oncall_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id VARCHAR(255) NOT NULL,
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
    summary TEXT NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'medium',
    details JSONB DEFAULT '{}',
    status VARCHAR(20) DEFAULT 'triggered',
    triggered_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    resolved_at TIMESTAMP WITH TIME ZONE,
    escalated_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_oncall_alerts_status ON public.oncall_alerts(status);
CREATE INDEX IF NOT EXISTS idx_oncall_alerts_tenant ON public.oncall_alerts(tenant_id);

ALTER TABLE public.oncall_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "oncall_alerts_service_role_all" ON public.oncall_alerts
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Add tier column to tenants if not exists
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tenants' AND column_name = 'tier') THEN
    ALTER TABLE public.tenants ADD COLUMN tier VARCHAR(20) DEFAULT 'free';
  END IF;
END $$;
