
-- AGT-019: MITRE ATT&CK Rules Pipeline
CREATE TABLE IF NOT EXISTS public.mitre_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    technique_id VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    description TEXT DEFAULT '',
    tactic VARCHAR(100) DEFAULT 'unknown',
    platform JSONB DEFAULT '[]'::jsonb,
    data_sources JSONB DEFAULT '[]'::jsonb,
    detection TEXT DEFAULT '',
    mitre_created TIMESTAMPTZ,
    mitre_modified TIMESTAMPTZ,
    mitre_version INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT TRUE,
    last_synced_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mitre_rules_technique ON public.mitre_rules(technique_id);
CREATE INDEX IF NOT EXISTS idx_mitre_rules_tactic ON public.mitre_rules(tactic);
CREATE INDEX IF NOT EXISTS idx_mitre_rules_active ON public.mitre_rules(is_active);

CREATE TABLE IF NOT EXISTS public.mitre_metadata (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version VARCHAR(50),
    synced_at TIMESTAMPTZ DEFAULT now(),
    total_rules INTEGER DEFAULT 0,
    new_rules INTEGER DEFAULT 0,
    updated_rules INTEGER DEFAULT 0,
    sync_duration_ms INTEGER DEFAULT 0
);

-- AGT-028: Agent Version Management
CREATE TABLE IF NOT EXISTS public.agent_update_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL,
    tenant_id UUID,
    current_version VARCHAR(20) NOT NULL,
    target_version VARCHAR(20) NOT NULL,
    status VARCHAR(30) DEFAULT 'pending',
    triggered_by VARCHAR(50) DEFAULT 'system',
    triggered_at TIMESTAMPTZ DEFAULT now(),
    completed_at TIMESTAMPTZ,
    error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_agent_update_events_agent ON public.agent_update_events(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_update_events_status ON public.agent_update_events(status);

CREATE TABLE IF NOT EXISTS public.tenant_version_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL UNIQUE,
    min_version VARCHAR(20) DEFAULT 'v5.0.0',
    auto_update_enabled BOOLEAN DEFAULT TRUE,
    reason TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ
);

-- RLS for mitre_rules (read-only for all authenticated)
ALTER TABLE public.mitre_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mitre_rules_select_all" ON public.mitre_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "mitre_rules_service_role" ON public.mitre_rules FOR ALL TO service_role USING (true);

-- RLS for mitre_metadata
ALTER TABLE public.mitre_metadata ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mitre_metadata_select_all" ON public.mitre_metadata FOR SELECT TO authenticated USING (true);
CREATE POLICY "mitre_metadata_service_role" ON public.mitre_metadata FOR ALL TO service_role USING (true);

-- RLS for agent_update_events (tenant-scoped)
ALTER TABLE public.agent_update_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agent_update_events_service_role" ON public.agent_update_events FOR ALL TO service_role USING (true);

-- RLS for tenant_version_policies (tenant-scoped)
ALTER TABLE public.tenant_version_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_version_policies_service_role" ON public.tenant_version_policies FOR ALL TO service_role USING (true);
