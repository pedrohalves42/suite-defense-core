-- Create api_keys table for external API authentication
CREATE TABLE IF NOT EXISTS public.api_keys (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL,
  scopes TEXT[] NOT NULL DEFAULT ARRAY['read']::TEXT[],
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_used_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Enable RLS
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins can manage API keys in their tenant"
ON public.api_keys
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role) AND tenant_id = current_user_tenant_id())
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND tenant_id = current_user_tenant_id());

CREATE POLICY "Service role has full access to api_keys"
ON public.api_keys
FOR ALL
USING (true)
WITH CHECK (true);

-- Create trigger for updated_at
CREATE TRIGGER update_api_keys_updated_at
BEFORE UPDATE ON public.api_keys
FOR EACH ROW
EXECUTE FUNCTION public.update_tenant_settings_updated_at();

-- Create indexes
CREATE INDEX idx_api_keys_tenant_id ON public.api_keys(tenant_id);
CREATE INDEX idx_api_keys_key_hash ON public.api_keys(key_hash);
CREATE INDEX idx_api_keys_is_active ON public.api_keys(is_active);

-- Create table for API request logs
CREATE TABLE IF NOT EXISTS public.api_request_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  api_key_id UUID REFERENCES public.api_keys(id) ON DELETE SET NULL,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  response_time_ms INTEGER,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.api_request_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins can read API logs in their tenant"
ON public.api_request_logs
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role) AND tenant_id = current_user_tenant_id());

CREATE POLICY "Service role has full access to api_request_logs"
ON public.api_request_logs
FOR ALL
USING (true)
WITH CHECK (true);

-- Create indexes
CREATE INDEX idx_api_request_logs_tenant_id ON public.api_request_logs(tenant_id);
CREATE INDEX idx_api_request_logs_api_key_id ON public.api_request_logs(api_key_id);
CREATE INDEX idx_api_request_logs_created_at ON public.api_request_logs(created_at DESC);