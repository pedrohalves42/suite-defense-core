-- Add DNS local filter feature flag to tenant_settings
ALTER TABLE public.tenant_settings 
ADD COLUMN IF NOT EXISTS dns_local_filter_enabled BOOLEAN DEFAULT false;

-- Add comment for documentation
COMMENT ON COLUMN public.tenant_settings.dns_local_filter_enabled IS 'Enables DNS-level site blocking via local CyberShield DNS resolver on endpoints';

-- Index for fast queries on enabled tenants
CREATE INDEX IF NOT EXISTS idx_tenant_settings_dns_filter 
ON public.tenant_settings(tenant_id) WHERE dns_local_filter_enabled = true;

-- Also add to tenant_features for quota/feature tracking
INSERT INTO public.tenant_features (tenant_id, feature_key, enabled, quota_limit, quota_used, metadata)
SELECT 
  t.id,
  'dns_local_filter',
  false,
  NULL,
  0,
  '{"description": "Filtro DNS local no endpoint para bloqueio de sites"}'::jsonb
FROM public.tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM public.tenant_features tf 
  WHERE tf.tenant_id = t.id AND tf.feature_key = 'dns_local_filter'
)
ON CONFLICT (tenant_id, feature_key) DO NOTHING;