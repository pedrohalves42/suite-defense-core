
-- Phase 2: Tenant Branding + SIEM Export + Auto-Remediation tables

-- 1. Tenant Branding for White-label Reports
CREATE TABLE IF NOT EXISTS public.tenant_branding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  logo_url TEXT,
  primary_color VARCHAR(7) DEFAULT '#1e40af',
  secondary_color VARCHAR(7) DEFAULT '#3b82f6',
  accent_color VARCHAR(7) DEFAULT '#0ea5e9',
  company_name TEXT,
  company_cnpj TEXT,
  company_address TEXT,
  company_phone TEXT,
  company_email TEXT,
  company_website TEXT,
  report_footer_text TEXT,
  report_header_text TEXT,
  custom_sections JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id)
);

ALTER TABLE public.tenant_branding ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_branding_tenant_isolation" ON public.tenant_branding
  FOR ALL TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.user_roles WHERE user_id = auth.uid()));

-- 2. SIEM Export Configuration
CREATE TABLE IF NOT EXISTS public.siem_export_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  format TEXT NOT NULL DEFAULT 'cef' CHECK (format IN ('cef', 'syslog', 'json')),
  is_active BOOLEAN DEFAULT true,
  webhook_url TEXT,
  api_key_hash TEXT,
  include_event_types TEXT[] DEFAULT ARRAY['alert', 'quarantine', 'vulnerability', 'agent_state'],
  batch_size INTEGER DEFAULT 100,
  export_interval_minutes INTEGER DEFAULT 5,
  last_export_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, format)
);

ALTER TABLE public.siem_export_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "siem_export_configs_tenant_isolation" ON public.siem_export_configs
  FOR ALL TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.user_roles WHERE user_id = auth.uid()));

-- 3. SIEM Export History
CREATE TABLE IF NOT EXISTS public.siem_export_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  config_id UUID NOT NULL REFERENCES public.siem_export_configs(id) ON DELETE CASCADE,
  events_exported INTEGER DEFAULT 0,
  format TEXT NOT NULL,
  status TEXT DEFAULT 'success' CHECK (status IN ('success', 'partial', 'failed')),
  error_message TEXT,
  exported_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.siem_export_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "siem_export_history_tenant_isolation" ON public.siem_export_history
  FOR ALL TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.user_roles WHERE user_id = auth.uid()));

-- 4. Auto-Remediation Actions Log
CREATE TABLE IF NOT EXISTS public.auto_remediation_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL,
  agent_name TEXT,
  action_type TEXT NOT NULL CHECK (action_type IN ('kill_process', 'firewall_block', 'patch_apply', 'quarantine_file', 'restart_service')),
  trigger_source TEXT NOT NULL,
  trigger_details JSONB DEFAULT '{}'::jsonb,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'executing', 'success', 'failed', 'rolled_back')),
  result JSONB,
  error_message TEXT,
  requires_approval BOOLEAN DEFAULT false,
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.auto_remediation_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auto_remediation_actions_tenant_isolation" ON public.auto_remediation_actions
  FOR ALL TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.user_roles WHERE user_id = auth.uid()));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tenant_branding_tenant ON public.tenant_branding(tenant_id);
CREATE INDEX IF NOT EXISTS idx_siem_export_configs_tenant ON public.siem_export_configs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_siem_export_history_config ON public.siem_export_history(config_id);
CREATE INDEX IF NOT EXISTS idx_auto_remediation_tenant ON public.auto_remediation_actions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_auto_remediation_status ON public.auto_remediation_actions(status);
CREATE INDEX IF NOT EXISTS idx_auto_remediation_agent ON public.auto_remediation_actions(agent_id);

-- Enable realtime for remediation actions
ALTER PUBLICATION supabase_realtime ADD TABLE public.auto_remediation_actions;
