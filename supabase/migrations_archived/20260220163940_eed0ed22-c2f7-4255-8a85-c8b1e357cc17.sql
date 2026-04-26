
-- FASE 3: Multi-Plataforma + ITSM

CREATE TABLE public.itsm_integrations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('jira', 'servicenow')),
  display_name TEXT NOT NULL DEFAULT '',
  base_url TEXT NOT NULL,
  project_key TEXT,
  auth_type TEXT NOT NULL DEFAULT 'api_token' CHECK (auth_type IN ('api_token', 'oauth2', 'basic')),
  credentials_encrypted JSONB NOT NULL DEFAULT '{}',
  default_issue_type TEXT DEFAULT 'Incident',
  default_priority TEXT DEFAULT 'Medium',
  field_mappings JSONB DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  auto_create_on_alert BOOLEAN NOT NULL DEFAULT false,
  auto_create_severity_threshold TEXT DEFAULT 'high',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  UNIQUE(tenant_id, provider, base_url)
);

ALTER TABLE public.itsm_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users can view their ITSM integrations"
  ON public.itsm_integrations FOR SELECT
  USING (tenant_id IN (SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid()));

CREATE POLICY "Tenant admins can manage ITSM integrations"
  ON public.itsm_integrations FOR ALL
  USING (tenant_id IN (SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('admin', 'super_admin')))
  WITH CHECK (tenant_id IN (SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('admin', 'super_admin')));

CREATE TABLE public.itsm_tickets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES public.itsm_integrations(id) ON DELETE CASCADE,
  external_ticket_id TEXT NOT NULL,
  external_ticket_key TEXT,
  external_ticket_url TEXT,
  provider TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('alert', 'vulnerability', 'remediation', 'compliance', 'manual')),
  source_id UUID,
  summary TEXT NOT NULL,
  description TEXT,
  priority TEXT DEFAULT 'Medium',
  status TEXT DEFAULT 'open',
  external_status TEXT,
  agent_id UUID,
  agent_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  synced_at TIMESTAMPTZ,
  created_by UUID
);

ALTER TABLE public.itsm_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users can view their ITSM tickets"
  ON public.itsm_tickets FOR SELECT
  USING (tenant_id IN (SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid()));

CREATE POLICY "Tenant users can create ITSM tickets"
  ON public.itsm_tickets FOR INSERT
  WITH CHECK (tenant_id IN (SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid()));

CREATE POLICY "Tenant admins can manage ITSM tickets"
  ON public.itsm_tickets FOR UPDATE
  USING (tenant_id IN (SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid()));

CREATE TABLE public.platform_configs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('windows', 'macos', 'linux')),
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  install_command_template TEXT,
  agent_binary_url TEXT,
  default_install_path TEXT,
  service_name TEXT DEFAULT 'CyberShieldAgent',
  config_overrides JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, platform)
);

ALTER TABLE public.platform_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users can view platform configs"
  ON public.platform_configs FOR SELECT
  USING (tenant_id IN (SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid()));

CREATE POLICY "Tenant admins can manage platform configs"
  ON public.platform_configs FOR ALL
  USING (tenant_id IN (SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('admin', 'super_admin')))
  WITH CHECK (tenant_id IN (SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('admin', 'super_admin')));

CREATE TRIGGER update_itsm_integrations_updated_at
  BEFORE UPDATE ON public.itsm_integrations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_itsm_tickets_updated_at
  BEFORE UPDATE ON public.itsm_tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_platform_configs_updated_at
  BEFORE UPDATE ON public.platform_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_itsm_integrations_tenant ON public.itsm_integrations(tenant_id);
CREATE INDEX idx_itsm_tickets_tenant ON public.itsm_tickets(tenant_id);
CREATE INDEX idx_itsm_tickets_integration ON public.itsm_tickets(integration_id);
CREATE INDEX idx_itsm_tickets_source ON public.itsm_tickets(source_type, source_id);
CREATE INDEX idx_platform_configs_tenant ON public.platform_configs(tenant_id, platform);
