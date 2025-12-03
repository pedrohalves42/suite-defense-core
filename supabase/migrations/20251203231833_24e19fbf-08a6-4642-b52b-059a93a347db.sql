-- Create table for agent network information
CREATE TABLE public.agent_network_info (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  firewall_domain BOOLEAN DEFAULT NULL,
  firewall_private BOOLEAN DEFAULT NULL,
  firewall_public BOOLEAN DEFAULT NULL,
  open_ports JSONB DEFAULT '[]'::jsonb,
  active_connections JSONB DEFAULT '[]'::jsonb,
  network_adapters JSONB DEFAULT '[]'::jsonb,
  dns_servers JSONB DEFAULT '[]'::jsonb,
  gateway_ip TEXT,
  public_ip TEXT,
  dns_test_success BOOLEAN DEFAULT NULL,
  https_test_success BOOLEAN DEFAULT NULL,
  collected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for fast lookups
CREATE INDEX idx_agent_network_info_agent_id ON public.agent_network_info(agent_id);
CREATE INDEX idx_agent_network_info_tenant_id ON public.agent_network_info(tenant_id);
CREATE INDEX idx_agent_network_info_collected_at ON public.agent_network_info(collected_at DESC);

-- Enable RLS
ALTER TABLE public.agent_network_info ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view network info in their tenant"
ON public.agent_network_info
FOR SELECT
USING (tenant_id IN (
  SELECT tenant_id FROM user_roles 
  WHERE user_id = auth.uid() 
  AND role IN ('admin', 'operator', 'viewer', 'super_admin')
));

CREATE POLICY "Super admins can view all network info"
ON public.agent_network_info
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM user_roles 
  WHERE user_id = auth.uid() AND role = 'super_admin'
));

-- Add collect_network_info to valid job types
COMMENT ON TABLE public.agent_network_info IS 'Stores network diagnostics collected from agents including firewall status, open ports, and connectivity tests';