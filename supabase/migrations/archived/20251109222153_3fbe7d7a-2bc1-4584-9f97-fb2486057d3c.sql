-- Create tenant_features table for granular permissions
CREATE TABLE IF NOT EXISTS public.tenant_features (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  quota_limit INTEGER,
  quota_used INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, feature_key)
);

-- Enable RLS
ALTER TABLE public.tenant_features ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins can manage tenant features"
ON public.tenant_features
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role) AND tenant_id = current_user_tenant_id())
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND tenant_id = current_user_tenant_id());

CREATE POLICY "Users can view their tenant features"
ON public.tenant_features
FOR SELECT
USING (tenant_id = current_user_tenant_id());

-- Create trigger for updated_at
CREATE TRIGGER update_tenant_features_updated_at
BEFORE UPDATE ON public.tenant_features
FOR EACH ROW
EXECUTE FUNCTION public.update_tenant_settings_updated_at();

-- Insert default features for existing tenants
INSERT INTO public.tenant_features (tenant_id, feature_key, enabled, quota_limit)
SELECT 
  id,
  feature_key,
  true,
  CASE 
    WHEN feature_key = 'virus_scans' THEN 1000
    WHEN feature_key = 'agents' THEN 50
    WHEN feature_key = 'jobs' THEN 500
    WHEN feature_key = 'quarantine' THEN 100
    WHEN feature_key = 'audit_logs' THEN NULL
    WHEN feature_key = 'api_access' THEN NULL
    ELSE NULL
  END as quota_limit
FROM 
  public.tenants,
  (VALUES 
    ('virus_scans'),
    ('agents'),
    ('jobs'),
    ('quarantine'),
    ('audit_logs'),
    ('api_access'),
    ('advanced_reporting'),
    ('webhook_alerts'),
    ('email_alerts'),
    ('auto_quarantine')
  ) as features(feature_key)
ON CONFLICT (tenant_id, feature_key) DO NOTHING;

-- Create index for performance
CREATE INDEX idx_tenant_features_tenant_id ON public.tenant_features(tenant_id);
CREATE INDEX idx_tenant_features_feature_key ON public.tenant_features(feature_key);