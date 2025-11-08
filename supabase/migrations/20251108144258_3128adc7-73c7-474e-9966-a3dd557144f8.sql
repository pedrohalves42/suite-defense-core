-- Create tenant_settings table for storing tenant-specific configurations
CREATE TABLE public.tenant_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  
  -- Alert configurations
  alert_email TEXT,
  alert_webhook_url TEXT,
  alert_threshold_virus_positive INTEGER DEFAULT 1,
  alert_threshold_failed_jobs INTEGER DEFAULT 5,
  alert_threshold_offline_agents INTEGER DEFAULT 3,
  
  -- Integration flags (actual keys stored in Supabase secrets)
  virustotal_enabled BOOLEAN DEFAULT false,
  stripe_enabled BOOLEAN DEFAULT false,
  
  -- Feature flags
  enable_email_alerts BOOLEAN DEFAULT true,
  enable_webhook_alerts BOOLEAN DEFAULT false,
  enable_auto_quarantine BOOLEAN DEFAULT false,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  UNIQUE(tenant_id)
);

-- Enable RLS
ALTER TABLE public.tenant_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins can manage settings in their tenant"
ON public.tenant_settings
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) AND tenant_id = current_user_tenant_id())
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND tenant_id = current_user_tenant_id());

CREATE POLICY "Operators and viewers can read settings in their tenant"
ON public.tenant_settings
FOR SELECT
TO authenticated
USING ((has_role(auth.uid(), 'operator'::app_role) OR has_role(auth.uid(), 'viewer'::app_role)) AND tenant_id = current_user_tenant_id());

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION public.update_tenant_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_tenant_settings_updated_at
BEFORE UPDATE ON public.tenant_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_tenant_settings_updated_at();

-- Create default settings for existing tenants
INSERT INTO public.tenant_settings (tenant_id)
SELECT id FROM public.tenants
ON CONFLICT (tenant_id) DO NOTHING;