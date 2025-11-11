-- Create installation_analytics table to track installer metrics
CREATE TABLE IF NOT EXISTS public.installation_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL,
  agent_name TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('generated', 'downloaded', 'command_copied', 'installed', 'failed')),
  platform TEXT NOT NULL CHECK (platform IN ('windows', 'linux')),
  installation_method TEXT CHECK (installation_method IN ('download', 'one_click', 'manual')),
  installation_time_seconds INTEGER,
  error_message TEXT,
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX idx_installation_analytics_tenant ON public.installation_analytics(tenant_id);
CREATE INDEX idx_installation_analytics_agent ON public.installation_analytics(agent_id);
CREATE INDEX idx_installation_analytics_event ON public.installation_analytics(event_type);
CREATE INDEX idx_installation_analytics_created ON public.installation_analytics(created_at DESC);
CREATE INDEX idx_installation_analytics_platform ON public.installation_analytics(platform);

-- Enable RLS
ALTER TABLE public.installation_analytics ENABLE ROW LEVEL SECURITY;

-- Allow admins to view analytics for their tenant
CREATE POLICY "Admins can view installation analytics for their tenant"
ON public.installation_analytics
FOR SELECT
USING (
  tenant_id IN (
    SELECT tenant_id FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role = 'admin'
  )
);

-- Allow super admins to view all analytics
CREATE POLICY "Super admins can view all installation analytics"
ON public.installation_analytics
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'super_admin'
  )
);

-- Allow agents to insert their own installation events
CREATE POLICY "Agents can insert installation events"
ON public.installation_analytics
FOR INSERT
WITH CHECK (true);

-- Create view for installation metrics summary
CREATE OR REPLACE VIEW public.installation_metrics_summary AS
SELECT
  tenant_id,
  platform,
  event_type,
  COUNT(*) as event_count,
  DATE_TRUNC('day', created_at) as date
FROM public.installation_analytics
GROUP BY tenant_id, platform, event_type, DATE_TRUNC('day', created_at);

-- Grant access to view
GRANT SELECT ON public.installation_metrics_summary TO authenticated;