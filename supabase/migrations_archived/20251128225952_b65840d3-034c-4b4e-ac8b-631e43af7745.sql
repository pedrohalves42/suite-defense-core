-- Migration: Create network_anomalies table
-- This table tracks network anomalies detected by the AI system

CREATE TABLE IF NOT EXISTS public.network_anomalies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  detected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  anomaly_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  description TEXT,
  source_ip TEXT,
  destination_ip TEXT,
  port INTEGER,
  protocol TEXT,
  raw_data JSONB DEFAULT '{}'::jsonb,
  acknowledged BOOLEAN DEFAULT false,
  acknowledged_at TIMESTAMP WITH TIME ZONE,
  acknowledged_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_network_anomalies_tenant_id ON public.network_anomalies(tenant_id);
CREATE INDEX IF NOT EXISTS idx_network_anomalies_agent_id ON public.network_anomalies(agent_id);
CREATE INDEX IF NOT EXISTS idx_network_anomalies_detected_at ON public.network_anomalies(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_network_anomalies_severity ON public.network_anomalies(severity);

-- Enable RLS
ALTER TABLE public.network_anomalies ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view network anomalies in their tenant
CREATE POLICY "Users can view network anomalies in their tenant"
  ON public.network_anomalies
  FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id 
      FROM user_roles 
      WHERE user_id = auth.uid() 
        AND role IN ('admin', 'operator', 'viewer', 'super_admin')
    )
  );

-- RLS Policy: Admins can update network anomalies in their tenant
CREATE POLICY "Admins can update network anomalies in their tenant"
  ON public.network_anomalies
  FOR UPDATE
  USING (
    tenant_id IN (
      SELECT tenant_id 
      FROM user_roles 
      WHERE user_id = auth.uid() 
        AND role IN ('admin', 'super_admin')
    )
  );

-- RLS Policy: System can insert network anomalies
CREATE POLICY "System can insert network anomalies"
  ON public.network_anomalies
  FOR INSERT
  WITH CHECK (true);

COMMENT ON TABLE public.network_anomalies IS 'Network anomalies detected by AI system for security monitoring';