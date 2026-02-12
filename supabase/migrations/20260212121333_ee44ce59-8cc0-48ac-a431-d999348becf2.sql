
-- Light Mode Configuration Table
-- Stores per-agent adaptive collection settings
CREATE TABLE public.agent_light_mode_configs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT false,
  activated_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  reason TEXT NOT NULL DEFAULT '',
  collection_interval_seconds INTEGER NOT NULL DEFAULT 60,
  skip_process_collection BOOLEAN NOT NULL DEFAULT false,
  skip_network_collection BOOLEAN NOT NULL DEFAULT false,
  compress_payloads BOOLEAN NOT NULL DEFAULT false,
  cpu_threshold_percent NUMERIC NOT NULL DEFAULT 50,
  network_threshold_mbps NUMERIC NOT NULL DEFAULT 10,
  media_processes JSONB NOT NULL DEFAULT '["chrome","firefox","msedge","vlc","obs64","obs","teams","zoom","discord","spotify"]',
  duration_minutes INTEGER NOT NULL DEFAULT 15,
  reduced_interval_seconds INTEGER NOT NULL DEFAULT 600,
  active_media_processes JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(agent_id)
);

-- Enable RLS
ALTER TABLE public.agent_light_mode_configs ENABLE ROW LEVEL SECURITY;

-- RLS Policies using user_roles subquery for robust tenant isolation
CREATE POLICY "Users can view light mode configs for their tenant"
ON public.agent_light_mode_configs FOR SELECT
USING (
  tenant_id IN (SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid())
);

CREATE POLICY "Service role can manage light mode configs"
ON public.agent_light_mode_configs FOR ALL
USING (true)
WITH CHECK (true);

-- Restrict the ALL policy to service_role only
ALTER POLICY "Service role can manage light mode configs" ON public.agent_light_mode_configs
TO service_role;

-- Index for fast lookups
CREATE INDEX idx_agent_light_mode_agent_id ON public.agent_light_mode_configs(agent_id);
CREATE INDEX idx_agent_light_mode_active ON public.agent_light_mode_configs(is_active) WHERE is_active = true;

-- Trigger for updated_at
CREATE TRIGGER update_agent_light_mode_configs_updated_at
  BEFORE UPDATE ON public.agent_light_mode_configs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
