
-- ═══════════════════════════════════════════════════════
-- Threat Intelligence Tables
-- ═══════════════════════════════════════════════════════

-- Indicator types enum
CREATE TYPE public.threat_indicator_type AS ENUM (
  'ip_address',
  'domain',
  'url',
  'file_hash_md5',
  'file_hash_sha1',
  'file_hash_sha256',
  'email',
  'cve'
);

-- Threat severity enum
CREATE TYPE public.threat_severity AS ENUM (
  'unknown',
  'low',
  'medium',
  'high',
  'critical'
);

-- Feed source enum
CREATE TYPE public.threat_feed_source AS ENUM (
  'abuse_ch_malwarebazaar',
  'abuse_ch_urlhaus',
  'abuse_ch_feodotracker',
  'alienvault_otx',
  'virustotal',
  'manual',
  'internal'
);

-- ── Threat Indicators Table ──
CREATE TABLE public.threat_indicators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  indicator_type threat_indicator_type NOT NULL,
  indicator_value TEXT NOT NULL,
  severity threat_severity NOT NULL DEFAULT 'unknown',
  source threat_feed_source NOT NULL,
  source_reference TEXT,
  tags TEXT[] DEFAULT '{}',
  confidence_score INTEGER DEFAULT 50,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, indicator_type, indicator_value, source)
);

-- ── Threat Feed Sync Log ──
CREATE TABLE public.threat_feed_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  feed_source threat_feed_source NOT NULL,
  sync_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sync_completed_at TIMESTAMPTZ,
  indicators_fetched INTEGER DEFAULT 0,
  indicators_new INTEGER DEFAULT 0,
  indicators_updated INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'running',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Threat Matches (IoC found on agent) ──
CREATE TABLE public.threat_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  indicator_id UUID NOT NULL REFERENCES public.threat_indicators(id) ON DELETE CASCADE,
  match_context TEXT NOT NULL,
  match_details JSONB DEFAULT '{}',
  severity threat_severity NOT NULL DEFAULT 'unknown',
  status TEXT NOT NULL DEFAULT 'open',
  responded_at TIMESTAMPTZ,
  response_action TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Indexes ──
CREATE INDEX idx_threat_indicators_tenant ON public.threat_indicators(tenant_id);
CREATE INDEX idx_threat_indicators_type_value ON public.threat_indicators(indicator_type, indicator_value);
CREATE INDEX idx_threat_indicators_active ON public.threat_indicators(is_active) WHERE is_active = true;
CREATE INDEX idx_threat_indicators_source ON public.threat_indicators(source);
CREATE INDEX idx_threat_feed_sync_tenant ON public.threat_feed_sync_log(tenant_id);
CREATE INDEX idx_threat_matches_tenant ON public.threat_matches(tenant_id);
CREATE INDEX idx_threat_matches_agent ON public.threat_matches(agent_id);
CREATE INDEX idx_threat_matches_status ON public.threat_matches(status) WHERE status = 'open';

-- ── RLS ──
ALTER TABLE public.threat_indicators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.threat_feed_sync_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.threat_matches ENABLE ROW LEVEL SECURITY;

-- threat_indicators policies
CREATE POLICY "tenant_isolation_select" ON public.threat_indicators
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_user_tenant_id());

CREATE POLICY "tenant_isolation_insert" ON public.threat_indicators
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.current_user_tenant_id());

CREATE POLICY "tenant_isolation_update" ON public.threat_indicators
  FOR UPDATE TO authenticated
  USING (tenant_id = public.current_user_tenant_id());

CREATE POLICY "service_role_all_threat_indicators" ON public.threat_indicators
  FOR ALL TO service_role USING (true);

-- threat_feed_sync_log policies
CREATE POLICY "tenant_isolation_select" ON public.threat_feed_sync_log
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_user_tenant_id());

CREATE POLICY "service_role_all_threat_feed_sync" ON public.threat_feed_sync_log
  FOR ALL TO service_role USING (true);

-- threat_matches policies
CREATE POLICY "tenant_isolation_select" ON public.threat_matches
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_user_tenant_id());

CREATE POLICY "tenant_isolation_insert" ON public.threat_matches
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.current_user_tenant_id());

CREATE POLICY "tenant_isolation_update" ON public.threat_matches
  FOR UPDATE TO authenticated
  USING (tenant_id = public.current_user_tenant_id());

CREATE POLICY "service_role_all_threat_matches" ON public.threat_matches
  FOR ALL TO service_role USING (true);

-- ── Updated_at trigger ──
CREATE OR REPLACE FUNCTION public.update_threat_indicators_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_threat_indicators_updated_at
  BEFORE UPDATE ON public.threat_indicators
  FOR EACH ROW
  EXECUTE FUNCTION public.update_threat_indicators_updated_at();

-- ── RPC: Get threat stats for dashboard ──
CREATE OR REPLACE FUNCTION public.get_threat_intel_stats(p_tenant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'total_indicators', (SELECT COUNT(*) FROM threat_indicators WHERE tenant_id = p_tenant_id AND is_active = true),
    'by_type', (
      SELECT COALESCE(jsonb_object_agg(indicator_type, cnt), '{}')
      FROM (SELECT indicator_type::text, COUNT(*) as cnt FROM threat_indicators WHERE tenant_id = p_tenant_id AND is_active = true GROUP BY indicator_type) sub
    ),
    'by_severity', (
      SELECT COALESCE(jsonb_object_agg(severity, cnt), '{}')
      FROM (SELECT severity::text, COUNT(*) as cnt FROM threat_indicators WHERE tenant_id = p_tenant_id AND is_active = true GROUP BY severity) sub
    ),
    'by_source', (
      SELECT COALESCE(jsonb_object_agg(source, cnt), '{}')
      FROM (SELECT source::text, COUNT(*) as cnt FROM threat_indicators WHERE tenant_id = p_tenant_id AND is_active = true GROUP BY source) sub
    ),
    'open_matches', (SELECT COUNT(*) FROM threat_matches WHERE tenant_id = p_tenant_id AND status = 'open'),
    'total_matches_24h', (SELECT COUNT(*) FROM threat_matches WHERE tenant_id = p_tenant_id AND created_at > now() - interval '24 hours'),
    'last_sync', (
      SELECT jsonb_build_object('source', source::text, 'completed_at', sync_completed_at, 'status', status, 'new_indicators', indicators_new)
      FROM threat_feed_sync_log WHERE tenant_id = p_tenant_id ORDER BY created_at DESC LIMIT 1
    )
  ) INTO result;
  
  RETURN COALESCE(result, '{}');
END;
$$;
