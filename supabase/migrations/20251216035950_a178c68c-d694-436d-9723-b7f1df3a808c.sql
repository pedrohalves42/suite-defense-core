-- Create blocked_access_attempts table for evidence tracking
CREATE TABLE IF NOT EXISTS public.blocked_access_attempts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  agent_name TEXT NOT NULL,
  domain TEXT NOT NULL,
  policy_id UUID REFERENCES public.blocked_websites(id) ON DELETE SET NULL,
  attempted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  blocked_by TEXT NOT NULL DEFAULT 'hosts_file',
  user_name TEXT,
  source TEXT DEFAULT 'dns_query',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.blocked_access_attempts ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view blocked attempts in their tenant"
ON public.blocked_access_attempts FOR SELECT
USING (tenant_id IN (
  SELECT tenant_id FROM user_roles 
  WHERE user_id = auth.uid() 
  AND role IN ('admin', 'operator', 'viewer', 'super_admin')
));

CREATE POLICY "Service role can insert blocked attempts"
ON public.blocked_access_attempts FOR INSERT
WITH CHECK (true);

-- Indexes for performance
CREATE INDEX idx_blocked_attempts_tenant_date ON public.blocked_access_attempts(tenant_id, attempted_at DESC);
CREATE INDEX idx_blocked_attempts_agent ON public.blocked_access_attempts(agent_id, attempted_at DESC);
CREATE INDEX idx_blocked_attempts_domain ON public.blocked_access_attempts(domain);