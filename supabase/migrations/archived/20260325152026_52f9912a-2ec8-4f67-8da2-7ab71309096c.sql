
-- ============================================================================
-- Fase 1: Tabelas para FIDO2, Session Store, Compliance Baselines, Drift Events
-- ============================================================================

-- 1. FIDO2 Credentials
CREATE TABLE IF NOT EXISTS public.fido2_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    credential_id VARCHAR(255) NOT NULL UNIQUE,
    public_key BYTEA NOT NULL,
    sign_count INTEGER NOT NULL DEFAULT 0,
    device_name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_used_at TIMESTAMP WITH TIME ZONE,
    transports JSONB DEFAULT '[]',
    aaguid VARCHAR(36),
    attestation_type VARCHAR(50),
    backed_up BOOLEAN DEFAULT FALSE,
    is_revoked BOOLEAN DEFAULT FALSE,
    revoked_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_fido2_credentials_user_id ON public.fido2_credentials(user_id);
CREATE INDEX IF NOT EXISTS idx_fido2_credentials_credential_id ON public.fido2_credentials(credential_id);

-- 2. Session Store (FIDO2 challenges, temporary tokens)
CREATE TABLE IF NOT EXISTS public.session_store (
    key VARCHAR(255) PRIMARY KEY,
    value JSONB NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_session_store_expires ON public.session_store(expires_at);

-- 3. Compliance Baselines per Tenant
CREATE TABLE IF NOT EXISTS public.compliance_baselines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE UNIQUE,
    rls_coverage FLOAT DEFAULT 100.0,
    mfa_enforcement BOOLEAN DEFAULT TRUE,
    audit_trail_integrity BOOLEAN DEFAULT TRUE,
    data_retention_days INTEGER DEFAULT 90,
    encryption_at_rest BOOLEAN DEFAULT TRUE,
    encryption_in_transit BOOLEAN DEFAULT TRUE,
    backup_frequency_hours INTEGER DEFAULT 24,
    backup_restore_tested_days INTEGER DEFAULT 30,
    baseline_hash VARCHAR(64),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Drift Events
CREATE TABLE IF NOT EXISTS public.drift_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    severity VARCHAR(20) NOT NULL,
    category VARCHAR(50) NOT NULL,
    description TEXT NOT NULL,
    current_value JSONB,
    expected_value JSONB,
    drift_score INTEGER NOT NULL,
    detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolution_action TEXT,
    resolved_by VARCHAR(50)
);

CREATE INDEX IF NOT EXISTS idx_drift_events_tenant_severity ON public.drift_events(tenant_id, severity);
CREATE INDEX IF NOT EXISTS idx_drift_events_detected_at ON public.drift_events(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_drift_events_unresolved ON public.drift_events(detected_at) WHERE resolved_at IS NULL;

-- ============================================================================
-- 5. RLS Policies
-- ============================================================================

ALTER TABLE public.fido2_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_store ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_baselines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drift_events ENABLE ROW LEVEL SECURITY;

-- fido2_credentials: users see own, service_role sees all
CREATE POLICY "fido2_select_own" ON public.fido2_credentials
    FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "fido2_insert_own" ON public.fido2_credentials
    FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "fido2_update_own" ON public.fido2_credentials
    FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "fido2_delete_own" ON public.fido2_credentials
    FOR DELETE USING (user_id = auth.uid());

-- session_store: service_role only (Edge Functions use service_role)
CREATE POLICY "session_store_service_role" ON public.session_store
    FOR ALL USING (true);

-- compliance_baselines: tenant-scoped via has_role
CREATE POLICY "compliance_baselines_select" ON public.compliance_baselines
    FOR SELECT USING (
        tenant_id IN (
            SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid()
        )
    );

-- drift_events: tenant-scoped
CREATE POLICY "drift_events_select" ON public.drift_events
    FOR SELECT USING (
        tenant_id IN (
            SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid()
        )
    );

-- ============================================================================
-- 6. Helper Functions
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cleanup_expired_sessions()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM public.session_store WHERE expires_at < NOW();
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Severity validation trigger (instead of CHECK constraint)
CREATE OR REPLACE FUNCTION public.validate_drift_severity()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.severity NOT IN ('low', 'medium', 'high', 'critical') THEN
        RAISE EXCEPTION 'Invalid severity: %. Must be low, medium, high, or critical', NEW.severity;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_drift_severity
    BEFORE INSERT OR UPDATE ON public.drift_events
    FOR EACH ROW EXECUTE FUNCTION public.validate_drift_severity();
