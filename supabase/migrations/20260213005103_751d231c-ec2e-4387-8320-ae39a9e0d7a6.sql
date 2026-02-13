
-- =====================================================
-- Observability & Remediation System Tables
-- =====================================================

-- 1. File Integrity Monitoring
CREATE TABLE IF NOT EXISTS public.agent_file_integrity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  file_path text NOT NULL,
  expected_hash text,
  actual_hash text,
  integrity_status text NOT NULL DEFAULT 'unknown',
  file_size bigint,
  modified_at timestamptz,
  scan_type text NOT NULL DEFAULT 'critical_files',
  severity text DEFAULT 'low',
  collected_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.agent_file_integrity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users can view file integrity" ON public.agent_file_integrity
  FOR SELECT TO authenticated USING (tenant_id = get_active_tenant_id() OR is_current_super_admin());

CREATE POLICY "Service role can manage file integrity" ON public.agent_file_integrity
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX idx_file_integrity_agent_scan ON public.agent_file_integrity(agent_id, scan_type, collected_at DESC);
CREATE INDEX idx_file_integrity_tenant ON public.agent_file_integrity(tenant_id);
CREATE INDEX idx_file_integrity_status ON public.agent_file_integrity(integrity_status) WHERE integrity_status != 'valid';

-- 2. Network Metrics
CREATE TABLE IF NOT EXISTS public.agent_network_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  interface_name text NOT NULL,
  bytes_sent bigint DEFAULT 0,
  bytes_received bigint DEFAULT 0,
  packets_sent bigint DEFAULT 0,
  packets_received bigint DEFAULT 0,
  errors_sent integer DEFAULT 0,
  errors_received integer DEFAULT 0,
  connections_active integer DEFAULT 0,
  connections_listening integer DEFAULT 0,
  collected_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.agent_network_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users can view network metrics" ON public.agent_network_metrics
  FOR SELECT TO authenticated USING (tenant_id = get_active_tenant_id() OR is_current_super_admin());

CREATE POLICY "Service role can manage network metrics" ON public.agent_network_metrics
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX idx_network_metrics_agent_time ON public.agent_network_metrics(agent_id, collected_at DESC);
CREATE INDEX idx_network_metrics_tenant ON public.agent_network_metrics(tenant_id);

-- 3. USB Device Control
CREATE TABLE IF NOT EXISTS public.agent_usb_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  device_id text NOT NULL,
  vendor_id text,
  product_id text,
  serial_number text,
  device_name text,
  device_type text DEFAULT 'other',
  is_blocked boolean DEFAULT false,
  block_reason text,
  first_seen timestamptz DEFAULT now(),
  last_seen timestamptz DEFAULT now(),
  collected_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.agent_usb_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users can view USB devices" ON public.agent_usb_devices
  FOR SELECT TO authenticated USING (tenant_id = get_active_tenant_id() OR is_current_super_admin());

CREATE POLICY "Service role can manage USB devices" ON public.agent_usb_devices
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX idx_usb_devices_agent ON public.agent_usb_devices(agent_id, device_id);
CREATE INDEX idx_usb_devices_tenant ON public.agent_usb_devices(tenant_id);
CREATE INDEX idx_usb_devices_blocked ON public.agent_usb_devices(is_blocked) WHERE is_blocked = true;

-- 4. Certificate Inventory
CREATE TABLE IF NOT EXISTS public.agent_certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  cert_store text NOT NULL DEFAULT 'personal',
  subject text NOT NULL,
  issuer text,
  thumbprint text NOT NULL,
  serial_number text,
  valid_from timestamptz,
  valid_until timestamptz,
  key_usage text[],
  is_self_signed boolean DEFAULT false,
  collected_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.agent_certificates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users can view certificates" ON public.agent_certificates
  FOR SELECT TO authenticated USING (tenant_id = get_active_tenant_id() OR is_current_super_admin());

CREATE POLICY "Service role can manage certificates" ON public.agent_certificates
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX idx_certificates_agent ON public.agent_certificates(agent_id);
CREATE INDEX idx_certificates_tenant ON public.agent_certificates(tenant_id);
CREATE INDEX idx_certificates_expiry ON public.agent_certificates(valid_until) WHERE valid_until IS NOT NULL;

-- 5. Behavioral Baseline
CREATE TABLE IF NOT EXISTS public.agent_behavioral_baseline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  baseline_type text NOT NULL,
  baseline_data jsonb NOT NULL DEFAULT '{}',
  mean_value numeric,
  std_deviation numeric,
  threshold_multiplier numeric DEFAULT 2.0,
  baseline_period_start timestamptz,
  baseline_period_end timestamptz,
  is_active boolean DEFAULT true,
  last_updated timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.agent_behavioral_baseline ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users can view behavioral baselines" ON public.agent_behavioral_baseline
  FOR SELECT TO authenticated USING (tenant_id = get_active_tenant_id() OR is_current_super_admin());

CREATE POLICY "Service role can manage behavioral baselines" ON public.agent_behavioral_baseline
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX idx_behavioral_baseline_agent_type ON public.agent_behavioral_baseline(agent_id, baseline_type);
CREATE INDEX idx_behavioral_baseline_tenant ON public.agent_behavioral_baseline(tenant_id);
CREATE INDEX idx_behavioral_baseline_active ON public.agent_behavioral_baseline(is_active) WHERE is_active = true;

-- 6. Vulnerability Tracking (standalone since agent_vulnerabilities doesn't exist yet)
CREATE TABLE IF NOT EXISTS public.agent_vulnerability_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  cve_id text NOT NULL,
  software_name text NOT NULL,
  installed_version text,
  fixed_version text,
  severity text NOT NULL DEFAULT 'medium',
  cvss_score numeric,
  remediation_status text DEFAULT 'pending',
  remediation_action text,
  auto_remediated boolean DEFAULT false,
  detected_at timestamptz DEFAULT now(),
  remediated_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.agent_vulnerability_scans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users can view vulnerability scans" ON public.agent_vulnerability_scans
  FOR SELECT TO authenticated USING (tenant_id = get_active_tenant_id() OR is_current_super_admin());

CREATE POLICY "Service role can manage vulnerability scans" ON public.agent_vulnerability_scans
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX idx_vuln_scans_agent ON public.agent_vulnerability_scans(agent_id);
CREATE INDEX idx_vuln_scans_tenant ON public.agent_vulnerability_scans(tenant_id);
CREATE INDEX idx_vuln_scans_severity ON public.agent_vulnerability_scans(severity);
CREATE INDEX idx_vuln_scans_remediation ON public.agent_vulnerability_scans(remediation_status) WHERE remediation_status = 'pending';
CREATE INDEX idx_vuln_scans_cve ON public.agent_vulnerability_scans(cve_id);

-- Table comments for V-103 compliance
COMMENT ON TABLE public.agent_file_integrity IS 'File integrity monitoring data collected by agents. Service role INSERT via heartbeat/Edge Functions.';
COMMENT ON TABLE public.agent_network_metrics IS 'Network interface metrics collected by agents. Service role INSERT via heartbeat/Edge Functions.';
COMMENT ON TABLE public.agent_usb_devices IS 'USB device inventory and control data. Service role INSERT via heartbeat/Edge Functions.';
COMMENT ON TABLE public.agent_certificates IS 'TLS/SSL certificate inventory from agent stores. Service role INSERT via heartbeat/Edge Functions.';
COMMENT ON TABLE public.agent_behavioral_baseline IS 'Statistical behavioral baselines for anomaly detection. Service role managed via cron/Edge Functions.';
COMMENT ON TABLE public.agent_vulnerability_scans IS 'CVE vulnerability tracking with remediation status. Service role managed via scan/Edge Functions.';
