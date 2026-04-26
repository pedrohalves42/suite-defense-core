
-- =============================================
-- DATA EXPOSURE DETECTION
-- =============================================
CREATE TABLE public.data_exposure_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  
  -- Detection details
  finding_type TEXT NOT NULL DEFAULT 'pii',  -- pii, financial, medical, credential, custom
  data_category TEXT NOT NULL,  -- cpf, cnpj, email_list, credit_card, medical_record, password, api_key
  severity TEXT NOT NULL DEFAULT 'medium',  -- critical, high, medium, low
  
  -- Location
  file_path TEXT NOT NULL,
  file_name TEXT,
  file_size_bytes BIGINT,
  file_owner TEXT,
  
  -- Evidence
  match_count INTEGER NOT NULL DEFAULT 1,
  sample_preview TEXT,  -- masked preview e.g. "***.***.***-12"
  detection_method TEXT DEFAULT 'regex',  -- regex, entropy, ml
  confidence_score NUMERIC(5,2) DEFAULT 100.0,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'open',  -- open, acknowledged, remediated, false_positive
  remediated_at TIMESTAMPTZ,
  remediated_by TEXT,
  
  -- Metadata
  detected_at TIMESTAMPTZ DEFAULT now(),
  collected_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  details JSONB DEFAULT '{}'
);

CREATE INDEX idx_data_exposure_tenant ON public.data_exposure_findings(tenant_id);
CREATE INDEX idx_data_exposure_agent ON public.data_exposure_findings(agent_id);
CREATE INDEX idx_data_exposure_severity ON public.data_exposure_findings(tenant_id, severity) WHERE status = 'open';
CREATE INDEX idx_data_exposure_category ON public.data_exposure_findings(data_category);

ALTER TABLE public.data_exposure_findings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_data_exposure" ON public.data_exposure_findings
  FOR ALL TO service_role USING (true);

CREATE POLICY "tenant_read_data_exposure" ON public.data_exposure_findings
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid()));

CREATE POLICY "tenant_update_data_exposure" ON public.data_exposure_findings
  FOR UPDATE TO authenticated
  USING (tenant_id IN (SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid()));

-- =============================================
-- RANSOMWARE DETECTION
-- =============================================
CREATE TABLE public.ransomware_indicators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  
  -- Detection type
  indicator_type TEXT NOT NULL,  -- mass_encryption, rapid_rename, suspicious_process, canary_triggered, entropy_spike
  severity TEXT NOT NULL DEFAULT 'critical',  -- critical, high, medium
  
  -- Details
  process_name TEXT,
  process_pid INTEGER,
  process_path TEXT,
  affected_path TEXT,
  affected_files_count INTEGER DEFAULT 0,
  files_per_second NUMERIC(10,2),
  entropy_score NUMERIC(5,2),  -- file entropy 0-8 (>7.5 = likely encrypted)
  
  -- Status
  status TEXT NOT NULL DEFAULT 'active',  -- active, contained, false_positive, resolved
  auto_response_taken TEXT,  -- process_killed, network_isolated, user_notified
  contained_at TIMESTAMPTZ,
  
  -- Evidence
  evidence_hash TEXT,
  sample_files TEXT[],  -- first 5 affected file paths
  
  -- Metadata
  detected_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  details JSONB DEFAULT '{}'
);

CREATE INDEX idx_ransomware_tenant ON public.ransomware_indicators(tenant_id);
CREATE INDEX idx_ransomware_agent ON public.ransomware_indicators(agent_id);
CREATE INDEX idx_ransomware_active ON public.ransomware_indicators(tenant_id, status) WHERE status = 'active';
CREATE INDEX idx_ransomware_severity ON public.ransomware_indicators(severity);

ALTER TABLE public.ransomware_indicators ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_ransomware" ON public.ransomware_indicators
  FOR ALL TO service_role USING (true);

CREATE POLICY "tenant_read_ransomware" ON public.ransomware_indicators
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid()));

CREATE POLICY "tenant_update_ransomware" ON public.ransomware_indicators
  FOR UPDATE TO authenticated
  USING (tenant_id IN (SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid()));

-- Enable realtime for both
ALTER PUBLICATION supabase_realtime ADD TABLE public.data_exposure_findings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ransomware_indicators;
